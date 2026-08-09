#!/bin/bash
cd admin-frontend
npx vite build
cp -r dist/* /var/www/admin/
echo 'Admin panel deployed to /var/www/admin/'
