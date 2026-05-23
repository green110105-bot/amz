# ETL Boundary

Mock-backed ETL snapshots feed the AI decision service and worker loops.

Covered snapshot contracts: orders, inventory, listings, reports, campaign performance, search terms, and freshness metadata. Real SP-API and Ads API pulls stay outside this boundary until sandbox credentials are available.
