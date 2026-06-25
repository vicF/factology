# ===================================================================
#  Production Dockerfile — multi-stage
#  Stage 1: build frontend assets with Node
#  Stage 2: slim PHP-Apache runtime with baked-in code
# ===================================================================

# ── Stage 1: Node builder ──────────────────────────────────────────────────────
FROM node:22-alpine AS node-builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ── Stage 2: PHP runtime ──────────────────────────────────────────────────────
FROM php:8.3-apache

WORKDIR /var/www/html

# 1. System packages + PHP extensions
RUN apt-get update -qq && apt-get install -y -qq \
    libpq-dev libzip-dev libpng-dev libjpeg-dev libfreetype6-dev libonig-dev libicu-dev unzip curl \
  && docker-php-ext-configure gd --with-jpeg --with-freetype \
  && docker-php-ext-install -j$(nproc) pdo_pgsql pdo_mysql gd zip bcmath intl mbstring \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. Apache rewrite
RUN a2enmod rewrite

# 3. Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# 4. PHP dependencies (layer caching: package files change less often than code)
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader --no-scripts

# 5. Application code
COPY artisan .env.example ./
COPY app       ./app
COPY bootstrap ./bootstrap
COPY config    ./config
COPY database  ./database
COPY lang      ./lang
COPY public    ./public
COPY resources ./resources
COPY routes    ./routes
COPY vite.config.js ./

# 6. Pre-built frontend from Node stage
COPY --from=node-builder /build/public/build ./public/build

# 7. Ensure cache/storage dirs exist, then optimize + permissions
RUN mkdir -p bootstrap/cache storage/app/public storage/framework/cache storage/framework/views storage/logs \
  && php artisan storage:link \
  && php artisan package:discover --ansi \
  && chown -R www-data:www-data storage bootstrap/cache public/build

# 8. Document root → public/
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' \
    /etc/apache2/sites-available/*.conf \
  && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' \
    /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# 9. Entrypoint for first-run setup (key generation, migrations)
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["apache2-foreground"]
