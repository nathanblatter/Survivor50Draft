# Stage 1: Build frontend and backend
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files first for better layer caching
COPY backend/package.json backend/package-lock.json backend/
COPY frontend/package.json frontend/package-lock.json frontend/

# Install all dependencies
RUN cd backend && npm ci
RUN cd frontend && npm ci

# Copy source code
COPY backend/ backend/
COPY frontend/ frontend/

# Build frontend
RUN cd frontend && npm run build

# Build backend
RUN cd backend && npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy backend package files and install production deps only
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev

# Copy compiled backend
COPY --from=build /app/backend/dist backend/dist

# Copy built frontend
COPY --from=build /app/frontend/dist frontend/dist

EXPOSE 3001

CMD ["node", "backend/dist/index.js"]
