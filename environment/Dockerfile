FROM nginx:1.27-alpine

# Static replica: no build step, no dependencies to install, nothing to fetch.
COPY environment/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css app.js state_to_state_migration_normalized.csv /usr/share/nginx/html/
COPY vendor/ /usr/share/nginx/html/vendor/

EXPOSE 8901

CMD ["nginx", "-g", "daemon off;"]
