# First-time setup on the server

One pass, top to bottom. Assumes an Oracle Cloud instance you can already SSH into.

Two Oracle-specific traps before anything else:

- **There are two firewalls.** Opening a port in the OCI *security list* (or NSG) in the
  web console is only half the job — the images also ship iptables rules that drop
  everything except SSH. Both layers need 80 and 443 opened or Caddy cannot even get a
  certificate.
- **Let's Encrypt will not issue a certificate for an IP address**, and Oracle gives you
  no public hostname — `*.oraclevcn.com` resolves inside the VCN only. See below.

## 1. Open the ports

In the OCI console: VCN → Security Lists → add ingress rules for TCP 80 and 443 from
`0.0.0.0/0`.

On the box, whichever applies:

```bash
# Ubuntu images
sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Oracle Linux images
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

The proxy itself listens on `127.0.0.1:8080` and is never exposed directly, so no rule
is needed for it.

## 2. Get a hostname

Three options, cheapest first:

**`sslip.io` — nothing to sign up for.** `130-61-12-34.sslip.io` resolves to
`130.61.12.34` automatically (dots work too: `130.61.12.34.sslip.io`). It is on the
Public Suffix List, so Let's Encrypt treats each such name as its own registered domain
and will issue for it. Good for proving the path today.

**DuckDNS — free, and survives an IP change.** One signup gives you
`something.duckdns.org` whose record you can update.

**A subdomain you own.** Best long-term, for the reason below.

**Reserve the public IP either way.** OCI hands out *ephemeral* IPs by default, and they
move when the instance stops. The client persists the proxy URL in `userProxyUrl`, so a
hostname that changes breaks the setting for every player who configured it. Reserve the
address in the console (VNIC → the public IP → Reserved) before handing the URL out.

Confirm resolution before continuing, because Caddy's first start validates it:

```bash
dig +short proxy.example.com
```

## 3. Create the service user and directory

An unprivileged account with no shell and no home — it only needs to execute one binary
and open sockets.

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin sessionproxy
sudo mkdir -p /opt/session-proxy
sudo chown sessionproxy:sessionproxy /opt/session-proxy
```

## 4. Install the binary and the unit

From your machine, with the repo checked out:

```bash
cd proxy
GOOS=linux GOARCH=arm64 go build -trimpath -ldflags "-s -w" -o /tmp/session-proxy .
scp /tmp/session-proxy user@host:/tmp/
scp deploy/session-proxy.service user@host:/tmp/
```

Use `GOARCH=amd64` instead if the instance is an E2/E4 rather than an Ampere A1. `uname
-m` on the box says which: `aarch64` means arm64, `x86_64` means amd64.

Then on the box:

```bash
sudo install -o sessionproxy -g sessionproxy -m 0755 /tmp/session-proxy /opt/session-proxy/session-proxy
sudo install -m 0644 /tmp/session-proxy.service /etc/systemd/system/session-proxy.service
sudo systemctl daemon-reload
sudo systemctl enable --now session-proxy
systemctl status session-proxy --no-pager
curl -fsS http://127.0.0.1:8080/health
```

That last command should print `{"ok":true,"sessions":0}`.

## 5. Install Caddy and point it at the proxy

```bash
# Ubuntu
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Put `deploy/Caddyfile` at `/etc/caddy/Caddyfile` with your domain substituted, then:

```bash
sudo systemctl reload caddy
sudo journalctl -u caddy -f      # watch the certificate being issued
```

## 6. Verify from the outside

```bash
curl -fsS https://proxy.example.com/health
```

A JSON body over HTTPS means TLS, Caddy, the unit and the firewall are all correct.

To exercise the whole path including WebSockets and resume, from any machine:

```bash
npx wscat -c "wss://proxy.example.com/attach?session=$(openssl rand -hex 16)"
```

You should see Arkadia's login banner arrive as binary frames. Disconnect, reconnect
with the *same* session value within the TTL, and you should land back in the same
session rather than at a fresh banner.

## Later deploys

`deploy/deploy.sh user@host arm64` builds, tests, uploads and restarts. Remember that a
restart drops every live session.
