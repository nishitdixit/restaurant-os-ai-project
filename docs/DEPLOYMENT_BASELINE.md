# Deployment Baseline

Phase 0 uses GitHub Actions to validate the mainline and publish an immutable API OCI image to GitHub Container Registry on version tags/manual deployment runs.

The runtime hosting target is intentionally not hard-coded in the product architecture. The image is portable to the selected managed container runtime; production environment configuration supplies PostgreSQL, Redis and secrets.

The deployment artifact contains no source-controlled secrets. Runtime secrets are injected by the hosting environment.
