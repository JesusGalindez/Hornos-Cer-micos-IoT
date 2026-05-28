-- ============================================================================
-- Esquema de Base de Datos para Monitoreo de Hornos Cerámicos (SaaS Multitenant)
-- Diseñado para PostgreSQL + TimescaleDB (Compatible con Neon.com)
-- Idioma Nativo: Español
-- ============================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Intentar habilitar TimescaleDB (Si se ejecuta en Neon.com o Docker con TimescaleDB)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Limpieza previa de tablas en orden de dependencias para permitir reinicialización
DROP TABLE IF EXISTS telemetria_historica;
DROP TABLE IF EXISTS rampas_config;
DROP TABLE IF EXISTS dispositivos;
DROP TABLE IF EXISTS usuarios;

-- 1. TABLA: usuarios
-- Almacena las cuentas de clientes de la plataforma SaaS (Multitenant).
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    correo VARCHAR(255) UNIQUE NOT NULL,
    contrasena_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA: dispositivos
-- Almacena los hornos vinculados a cada usuario.
-- Cada dispositivo tiene un usuario MQTT único y su respectivo hash bcrypt del token.
CREATE TABLE dispositivos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    mqtt_usuario VARCHAR(100) UNIQUE NOT NULL,
    mqtt_contrasena_hash VARCHAR(255) NOT NULL,
    estado VARCHAR(20) DEFAULT 'desconectado', -- desconectado, conectado, calentando, enfriando, inactivo
    ultima_actividad TIMESTAMPTZ,
    creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dispositivos_usuario ON dispositivos(usuario_id);

-- 3. TABLA: rampas_config
-- Almacena las configuraciones de curvas de quema (temperatura/tiempo).
CREATE TABLE rampas_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    segmentos JSONB NOT NULL, -- Matriz de pasos/segmentos de rampa
    creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rampas_usuario ON rampas_config(usuario_id);

-- 4. TABLA: telemetria_historica (Hipertabla en TimescaleDB)
-- Guarda la información de temperatura en tiempo real proveniente de los hornos.
CREATE TABLE telemetria_historica (
    tiempo TIMESTAMPTZ NOT NULL,
    dispositivo_id UUID NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
    temperatura NUMERIC(6, 2) NOT NULL,
    temperatura_objetivo NUMERIC(6, 2) NOT NULL,
    estado_resistencia NUMERIC(5, 2) NOT NULL, -- Porcentaje 0 a 100% de PWM
    rssi NUMERIC(4, 1), -- Señal de Wi-Fi en dBm
    PRIMARY KEY (tiempo, dispositivo_id)
);

-- Convertir en hipertabla utilizando TimescaleDB para almacenamiento particionado por tiempo
SELECT create_hypertable('telemetria_historica', 'tiempo');

-- ============================================================================
-- DATOS INICIALES DE PRUEBA (MOCK DATA)
-- ============================================================================

-- 1. Insertar Usuario de Prueba: alberto@ejemplo.com
-- Contraseña plana para la App de usuario: "password123"
-- Hash bcrypt de "password123":
INSERT INTO usuarios (id, correo, contrasena_hash, nombre)
VALUES (
    '5a8288b2-132d-45db-9964-b040bf5ffbb7',
    'alberto@ejemplo.com',
    '$2b$10$wEvyzF/iQY2q/Kx3u/n9bOgFwNen2H0hJ9J38hU81Zc0u9lF0d8Kq', 
    'Alberto Galíndez'
);

-- 2. Insertar Dispositivo de Prueba (Horno Cerámico ESP32)
-- Para conectarse vía MQTT, el ESP32 usará:
--   Usuario: "horno_esp32_1"
--   Contraseña / Token: "token_esp32_secreto_123"
-- Hash bcrypt de "token_esp32_secreto_123":
INSERT INTO dispositivos (id, nombre, usuario_id, mqtt_usuario, mqtt_contrasena_hash, estado)
VALUES (
    'b4578e9b-0081-42ab-ba41-d68a994abfe2',
    'Horno Principal de Alberto',
    '5a8288b2-132d-45db-9964-b040bf5ffbb7',
    'horno_esp32_1',
    '$2b$10$T2E2FqKzX0N7Zg3fUjJtSu1j60D6QZ301K3H0R4V2S5M0U2K4N5S.', -- Hash bcrypt generado
    'desconectado'
);

-- 3. Insertar Rampa de Quema de Prueba (Curva de Bizcocho Cerámico)
INSERT INTO rampas_config (id, nombre, descripcion, usuario_id, segmentos)
VALUES (
    'd8f87e91-e402-4fdb-9ef1-4b1365ad4de0',
    'Bizcocho Estándar',
    'Curva lenta para bizcocho cerámico de arcilla roja o blanca hasta 1020°C',
    '5a8288b2-132d-45db-9964-b040bf5ffbb7',
    '[
        {"paso": 1, "tipo": "rampa", "velocidad_c_hr": 100, "temp_objetivo_c": 600, "meseta_minutos": 0},
        {"paso": 2, "tipo": "meseta", "velocidad_c_hr": 0, "temp_objetivo_c": 600, "meseta_minutos": 30},
        {"paso": 3, "tipo": "rampa", "velocidad_c_hr": 150, "temp_objetivo_c": 1020, "meseta_minutos": 45},
        {"paso": 4, "tipo": "enfriamiento", "velocidad_c_hr": 120, "temp_objetivo_c": 100, "meseta_minutos": 0}
    ]'::jsonb
);
