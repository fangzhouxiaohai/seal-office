FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress fonts-noto-cjk fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY main/documentFormats.json /app/main/documentFormats.json
COPY server/converter /app/server/converter
ENV HOST=0.0.0.0 PORT=8298 SEAL_OFFICE_EXECUTABLE=soffice
USER node
EXPOSE 8298
CMD ["node", "server/converter/index.cjs"]
