# Usar imagen base ligera de Node.js
FROM node:20-alpine

# Definir directorio de trabajo en el contenedor
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar configuración de TypeScript
COPY tsconfig.json ./

# Copiar el código fuente
COPY src/ ./src/

# Compilar TypeScript a JavaScript
RUN npm run build

# Exponer el puerto de la aplicación
EXPOSE 3000

# Comando para ejecutar la aplicación en modo desarrollo (para pruebas rápidas con docker-compose)
CMD ["npm", "run", "dev"]
