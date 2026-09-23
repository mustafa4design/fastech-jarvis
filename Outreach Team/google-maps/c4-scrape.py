#!/usr/bin/env python3
"""Campaign 4 — Local Businesses (Google Maps) pre-scrape.

Runs LOCALLY on Mustafa's PC at 5:30 AM PKT (Mon-Thu) via a local scheduled task,
because the cloud Phase 1 routine cannot reach the self-hosted scraper on localhost.

Picks today's search term + city from the rotation in
campaigns/campaign-4-local-maps/config.json, runs one job on the local
gosom/google-maps-scraper (http://localhost:8080), and writes
leads/[YYYY-MM-DD]/campaign-4-local-maps-raw.json, then commits + pushes it so the
6:00 AM PKT cloud Phase 1 can filter / enrich / write / log the leads.

Filtering is NOT done here — the Worker Agent applies the C4 rules in Phase 2.
On failure it still writes the raw file with status="failed" so Phase 1 can report it.

Usage:
  python c4-scrape.py              # scrape today's rotation, commit + push
  python c4-scrape.py --dry-run    # print today's term/city only
  python c4-scrape.py --no-git     # scrape + write file, skip commit/push
"""
import argparse, csv, io, json, subprocess, sys, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

API = "http://localhost:8080/api/v1"
PKT = timezone(timedelta(hours=5))
OUTREACH = Path(__file__).resolve().parent.parent          # .../Outreach Team
REPO = OUTREACH.parent                                       # .../fastech-jarvis
CONFIG = OUTREACH / "campaigns" / "campaign-4-local-maps" / "config.json"
KEEP = ["title", "emails", "phone", "website", "category", "address", "complete_address",
        "review_rating", "review_count", "timezone", "owner", "descriptions", "link"]


def http(method, path, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def api_up():
    try:
        http("GET", "/jobs", timeout=5)
        return True
    except Exception:
        return False


def ensure_scraper(kit_path):
    if api_up():
        return
    print("Scraper API down — running docker compose up -d")
    subprocess.run(["docker", "compose", "up", "-d"], cwd=kit_path, check=False)
    for _ in range(30):
        if api_up():
            return
        time.sleep(3)
    raise RuntimeError("Google Maps scraper API not reachable on localhost:8080 "
                       "(is Docker Desktop running?)")


def pick(cfg, today):
    rot = cfg["google_maps"]["rotation"]
    i = today.toordinal()
    return rot["search_terms"][i % len(rot["search_terms"])], rot["cities"][i % len(rot["cities"])]


def scrape(gm, term, city):
    keyword = f"{term} in {city['query']}"
    body = {"name": f"c4-{city['name']}", "keywords": [keyword], "lang": gm["lang"],
            "zoom": gm["zoom"], "lat": city["lat"], "lon": city["lon"], "fast_mode": False,
            "radius": gm["radius_meters"], "depth": gm["depth"], "email": gm["email"],
            "max_time": gm["max_time_seconds"]}
    job_id = json.loads(http("POST", "/jobs", body, timeout=60))["id"]
    print(f"Job {job_id}: {keyword}")
    deadline = time.time() + gm["max_time_seconds"] + 300
    status = "working"
    while time.time() < deadline:
        try:
            status = json.loads(http("GET", f"/jobs/{job_id}", timeout=60)).get("Status")
        except Exception as e:  # scraper is busy (e.g. first-run browser download) — keep polling
            print(f"  poll error (retrying): {e}")
        if status in ("ok", "failed"):
            break
        time.sleep(15)
    if status != "ok":
        raise RuntimeError(f"Job {job_id} ended with status={status}")
    rows = list(csv.DictReader(io.StringIO(http("GET", f"/jobs/{job_id}/download", timeout=120)
                                           .decode("utf-8-sig"))))
    try:
        http("DELETE", f"/jobs/{job_id}")
    except Exception:
        pass
    return keyword, job_id, rows


def git_push(path, msg):
    def git(*a):
        return subprocess.run(["git", *a], cwd=REPO, capture_output=True, text=True)
    git("pull", "--rebase", "--autostash", "-q")
    git("add", str(path))
    if git("diff", "--cached", "--quiet").returncode == 0:
        print("Nothing to commit.")
        return
    c = git("commit", "-q", "-m", msg)
    p = git("push", "-q")
    if c.returncode or p.returncode:
        raise RuntimeError(f"git failed: {c.stderr or ''}{p.stderr or ''}")
    print("Committed and pushed.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-git", action="store_true")
    args = ap.parse_args()

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    gm = cfg["google_maps"]
    now = datetime.now(PKT)
    term, city = pick(cfg, now.date())
    print(f"Today ({now:%Y-%m-%d} PKT): '{term}' in {city['name']} [{city['region']}]")
    if args.dry_run:
        return

    out = OUTREACH / "leads" / f"{now:%Y-%m-%d}" / "campaign-4-local-maps-raw.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    result = {"campaign_id": cfg["campaign_id"], "campaign_label": cfg["sheet_campaign_label"],
              "date": f"{now:%Y-%m-%d}", "scraped_at_pkt": now.strftime("%Y-%m-%d %H:%M"),
              "search_term": term, "city": city["name"], "region": city["region"],
              "send_bucket": city["send_bucket"], "depth": gm["depth"], "email": gm["email"]}
    try:
        ensure_scraper(gm["scraper_kit_path"])
        keyword, job_id, rows = scrape(gm, term, city)
        leads = []
        for n, r in enumerate(rows, 1):
            lead = {"lead_id": f"C4-{n:02d}"}
            lead.update({k: (r.get(k) or "").strip() for k in KEEP})
            lead["emails"] = [e.strip() for e in lead["emails"].split(",") if e.strip()]
            leads.append(lead)
        result.update(status="ok", keyword=keyword, job_id=job_id, count=len(leads),
                      with_email=sum(1 for l in leads if l["emails"]), leads=leads)
        print(f"{len(leads)} places, {result['with_email']} with an email")
    except Exception as e:
        result.update(status="failed", error=str(e), count=0, leads=[])
        print(f"FAILED: {e}", file=sys.stderr)

    out.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out}")
    if not args.no_git:
        git_push(out, f"C4 Google Maps pre-scrape {result['date']}: {term} in {city['name']} "
                      f"({result['status']}, {result['count']} places)")
    sys.exit(0 if result["status"] == "ok" else 1)


if __name__ == "__main__":
    main()
