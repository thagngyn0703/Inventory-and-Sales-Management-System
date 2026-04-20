# CI/CD Docker Deploy (VPS)

## 1) Required GitHub secrets

- `DEPLOY_HOST`: VPS IP/domain.
- `DEPLOY_USER`: SSH user on VPS.
- `SSH_PRIVATE_KEY`: private key content (PEM).
- `DEPLOY_PATH`: absolute repo path on VPS (example `/root/Inventory-and-Sales-Management-System`).

Optional:

- `DEPLOY_BRANCH`: branch deploy target (default `main`).

## 2) Auto deploy behavior

- Deploy runs automatically on every push to `main/master` (including merge commits).
- You can still trigger deploy manually with `workflow_dispatch`.

## 3) VPS prerequisites

- Docker Engine + Docker Compose plugin installed.
- Repository already cloned at `DEPLOY_PATH`.
- `.env.production` created at repo root (same level as `docker-compose.yml`).

## 4) Runtime commands on VPS

```bash
docker compose --env-file .env.production up -d --build --remove-orphans
docker compose ps
docker compose logs -f backend
```

## 5) CI behavior

- Backend test step is set to non-blocking (`continue-on-error: true`).
- If backend tests fail on GitHub Actions, pipeline still continues to frontend build and deploy.
