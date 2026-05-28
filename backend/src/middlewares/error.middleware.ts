import { Request, Response, NextFunction } from 'express';

/**
 * Middleware global para interceptar y formatear errores en la aplicación
 */
export const manejadorDeErrores = (
  error: any,
  peticion: Request,
  respuesta: Response,
  siguiente: NextFunction
) => {
  console.error('❌ Error no controlado detectado:', error);

  const codigoEstado = error.status || 500;
  const mensaje = error.message || 'Ocurrió un error interno en el servidor';

  respuesta.status(codigoEstado).json({
    exito: false,
    mensaje,
    detalles: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
};
