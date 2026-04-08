FROM node:20-alpine

# Python + reportlab + Pillow for PDF generation
RUN apk add --no-cache python3 py3-pip py3-setuptools && \
    pip3 install --break-system-packages reportlab Pillow

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build
COPY . .
RUN npm run build

# Persistent volume for SQLite
VOLUME ["/data"]
ENV DATABASE_PATH=/data/roof.db

EXPOSE 3000
CMD ["npm", "start"]
