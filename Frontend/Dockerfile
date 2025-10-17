# FROM: Using nginx (a web server) with Alpine Linux (very lightweight)
# nginx is perfect for serving static files (HTML, CSS, JS)
FROM nginx:alpine

# COPY: Replace nginx's default configuration with our custom one
# This tells nginx how to handle requests and proxy API calls to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

# COPY: Copy all your frontend files into nginx's serving directory
# Everything in Frontend/ will be available at http://localhost:8080
COPY . /usr/share/nginx/html

# EXPOSE: nginx listens on port 80 inside the container
EXPOSE 80

# HEALTHCHECK: Checks if nginx is responding
# wget tries to download index.html quietly
# If it succeeds, container is healthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/index.html || exit 1

# CMD: Start nginx in foreground mode
# "daemon off" keeps nginx running (containers stop if main process exits)
CMD ["nginx", "-g", "daemon off;"]