#!/bin/sh
sed -i "/listen_addresses =/d" /var/lib/postgresql/16/data/postgresql.conf
sed -i "/port =/d" /var/lib/postgresql/16/data/postgresql.conf
echo "listen_addresses = '*'" >> /var/lib/postgresql/16/data/postgresql.conf
echo "port = 55498" >> /var/lib/postgresql/16/data/postgresql.conf

# Ensure socket directory exists
mkdir -p /run/postgresql
chown -R postgres:postgres /run/postgresql

su - postgres -c "pg_ctl -D /var/lib/postgresql/16/data -l /var/lib/postgresql/16/logfile start"
sleep 2
su - postgres -c "psql -p 55498 -c \"CREATE DATABASE tfhc_e2e;\"" || true
su - postgres -c "psql -p 55498 -c \"ALTER USER postgres WITH PASSWORD 'tfhc_e2e_only';\""
su - postgres -c "psql -p 55498 -d tfhc_e2e -c 'SELECT 1;'"
