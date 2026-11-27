# Egress proxy for docker/egress/compose.yml: tinyproxy lets through only the hosts in
# allowlist.txt, and socat publishes the app's port (a container on an internal-only
# network cannot publish ports itself).
FROM alpine:3.20
RUN apk add --no-cache tinyproxy socat
COPY tinyproxy.conf /etc/egress/tinyproxy.conf
COPY entrypoint.sh /usr/local/bin/egress-entrypoint
RUN chmod 0755 /usr/local/bin/egress-entrypoint
USER nobody
EXPOSE 8888 41234
ENTRYPOINT ["/usr/local/bin/egress-entrypoint"]
