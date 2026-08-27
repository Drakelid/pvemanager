FROM postgres:16-alpine

# Coolify runs Compose through a build container connected to the host Docker
# daemon. A relative bind mount for this file is therefore seen as a directory
# on the Docker host. Including it in the image makes initialization portable.
COPY init.sql /docker-entrypoint-initdb.d/10-init.sql
