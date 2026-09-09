#!/bin/sh
mkdir -p /run/postgresql
chown -R postgres:postgres /run/postgresql
exec su - postgres -c "postgres -D /var/lib/postgresql/16/data"
