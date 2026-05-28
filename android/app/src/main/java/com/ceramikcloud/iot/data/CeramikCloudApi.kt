package com.ceramikcloud.iot.data

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

// Modelos de datos para Retrofit
data class PasoRampa(
    val paso: Int,
    val duracion_seg: Int,
    val temp_final: Int,
    val estado_horno: Int? = 1,
    val limite_ssr: Int? = 100
)

data class ProgramarRampaRequest(
    val usuario_id: String,
    val dispositivo_id: String,
    val nombre_curva: String,
    val rampas: List<PasoRampa>,
    val hora_inicio: String? = null
)

data class ComandoRequest(
    val usuario_id: String,
    val dispositivo_id: String,
    val accion: String
)

data class TelemetriaPunto(
    val tiempo: String,
    val temperatura: String,
    val temperatura_objetivo: String,
    val estado_resistencia: String,
    val rssi: String?,
    val mensaje_estado: String? = null
)

data class TelemetriaResponse(
    val exito: Boolean,
    val datos: List<TelemetriaPunto>
)

data class GuardarRegistroRequest(
    val nombre_curva: String,
    val dispositivo_id: String,
    val fecha_inicio: String,
    val fecha_fin: String,
    val temperatura_maxima: Double,
    val notas: String?
)

data class QuemaGuardada(
    val id: String,
    val nombre_curva: String,
    val dispositivo_id: String,
    val fecha_inicio: String,
    val fecha_fin: String,
    val temperatura_maxima: String,
    val notas: String?,
    val creado_en: String
)

data class ListaQuemasResponse(
    val exito: Boolean,
    val datos: List<QuemaGuardada>
)

data class ExitoResponse(
    val exito: Boolean,
    val mensaje: String?
)

// Interfaz Retrofit para API REST CeramikCloud
interface CeramikCloudApi {
    
    // Cargar curva programada (Neon + MQTT)
    @POST("api/v1/mqtt/programar")
    suspend fun programarHorno(@Body request: ProgramarRampaRequest): Response<ExitoResponse>

    // Enviar comando en vivo (INICIAR_QUEMA, APAGAR_EMERGENCIA)
    @POST("api/v1/mqtt/comando")
    suspend fun enviarComandoHorno(@Body request: ComandoRequest): Response<ExitoResponse>

    // Obtener historial completo de telemetría desde minuto cero
    @GET("api/v1/mqtt/telemetria/{dispositivoId}")
    suspend fun obtenerTelemetriaHistorica(@Path("dispositivoId") id: String): Response<TelemetriaResponse>

    // Asentar bitácora de quema en Neon.com
    @POST("api/v1/mqtt/guardar-historial")
    suspend fun guardarRegistroQuema(@Body request: GuardarRegistroRequest): Response<ExitoResponse>

    // Obtener historial de bitácoras guardadas en Neon.com
    @GET("api/v1/mqtt/quemas-guardadas")
    suspend fun obtenerQuemasGuardadas(): Response<ListaQuemasResponse>
}
