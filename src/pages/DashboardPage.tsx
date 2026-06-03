import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../ThemeContext';
import { Link } from 'react-router-dom';
import { ScanLine, LogOut, Monitor, Activity, Car, Cpu, Settings, Wifi, WifiOff, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';


// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN — cambiar aquí si el puerto o host del backend varía
// ─────────────────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:5000';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS — cuando se conecte la BD, estos mismos tipos se usan para mapear
// la respuesta del API REST o del ORM
// ─────────────────────────────────────────────────────────────────────────────
interface Deteccion {
  id: number;
  placa: string;
  hora: string;
  precision_ocr: number;
  precision_yolo: number;
  foto: string;
}

interface ServerStatus {
  conectado: boolean;
  fuente: string;
  intentos: number;
  error: string;
  total: number;
  config: CamaraConfig;
}

interface CamaraConfig {
  tipo: 'local' | 'ip' | 'rtsp';
  ip: string;
  puerto: string;
  indice_local: number;
  url_personalizada: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPA DE DATOS — todas las llamadas al backend están aquí.
// Cuando se implemente BD, solo se modifica este objeto.
// ─────────────────────────────────────────────────────────────────────────────
const api = {
  getDetecciones: (): Promise<Deteccion[]> =>
    fetch(`${API_BASE}/api/detecciones`).then(r => r.json()),

  getStatus: (): Promise<ServerStatus> =>
    fetch(`${API_BASE}/api/status`).then(r => r.json()),

  postConfig: (config: Partial<CamaraConfig>): Promise<{ ok: boolean; error?: string }> =>
    fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).then(r => r.json()),

  limpiarHistorial: (): Promise<{ ok: boolean }> =>
    fetch(`${API_BASE}/api/historial/limpiar`, { method: 'POST' }).then(r => r.json()),
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: Modal de configuración de cámara
// ─────────────────────────────────────────────────────────────────────────────
function ConfigCamaraModal({
  isDark,
  configActual,
  onClose,
  onAplicar,
}: {
  isDark: boolean;
  configActual?: CamaraConfig;
  onClose: () => void;
  onAplicar: (cfg: Partial<CamaraConfig>) => void;
}) {
  const [form, setForm] = useState<CamaraConfig>({
    tipo: configActual?.tipo ?? 'ip',
    ip: configActual?.ip ?? '192.168.1.8',
    puerto: configActual?.puerto ?? '8080',
    indice_local: configActual?.indice_local ?? 0,
    url_personalizada: configActual?.url_personalizada ?? '',
  });
  const [cargando, setCargando] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const set = (k: keyof CamaraConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleAplicar = async () => {
    setCargando(true);
    setFeedback(null);
    try {
      const res = await api.postConfig(form);
      if (res.ok) {
        setFeedback({ ok: true, msg: 'Configuración aplicada. Reconectando...' });
        onAplicar(form);
        setTimeout(onClose, 1500);
      } else {
        setFeedback({ ok: false, msg: res.error ?? 'Error desconocido' });
      }
    } catch {
      setFeedback({ ok: false, msg: 'No se pudo conectar con el servidor' });
    } finally {
      setCargando(false);
    }
  };

  const inputCls = `w-full rounded-lg px-3 py-2 text-sm border outline-none transition-all
    focus:ring-1 focus:ring-accent-light/50 focus:border-accent-light
    ${isDark
      ? 'bg-[#0f1117] border-surface-border text-white placeholder-slate-600'
      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'}`;

  const labelCls = `block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden
        ${isDark ? 'bg-[#161b22] border-surface-border' : 'bg-white border-slate-200'}`}>

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b
          ${isDark ? 'border-surface-border' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-accent-light" />
            <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Configurar cámara
            </span>
          </div>
          <button onClick={onClose}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all
              ${isDark ? 'text-slate-500 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Selector de tipo */}
          <div>
            <label className={labelCls}>Tipo de fuente</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { val: 'local', label: 'Webcam', sub: 'PC local' },
                { val: 'ip',    label: 'IP / WiFi', sub: 'IP Webcam' },
                { val: 'rtsp',  label: 'RTSP/URL', sub: 'stream custom' },
              ] as const).map(({ val, label, sub }) => (
                <button key={val}
                  onClick={() => setForm(p => ({ ...p, tipo: val }))}
                  className={`rounded-xl border p-3 text-left transition-all
                    ${form.tipo === val
                      ? 'border-accent-light bg-accent/10 text-accent-light'
                      : isDark
                        ? 'border-surface-border text-slate-500 hover:border-accent-light/40'
                        : 'border-slate-200 text-slate-500 hover:border-accent-light/40'}`}>
                  <div className="text-xs font-semibold">{label}</div>
                  <div className="text-[10px] mt-0.5 opacity-60">{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Campos según tipo */}
          {form.tipo === 'local' && (
            <div>
              <label className={labelCls}>Índice de cámara</label>
              <input type="number" min={0} max={9}
                value={form.indice_local}
                onChange={e => setForm(p => ({ ...p, indice_local: parseInt(e.target.value) || 0 }))}
                className={inputCls} placeholder="0" />
              <p className={`text-xs mt-1.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                0 = webcam principal del PC
              </p>
            </div>
          )}

          {form.tipo === 'ip' && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Dirección IP</label>
                <input type="text" value={form.ip} onChange={set('ip')}
                  className={inputCls} placeholder="192.168.1.8" />
              </div>
              <div>
                <label className={labelCls}>Puerto</label>
                <input type="text" value={form.puerto} onChange={set('puerto')}
                  className={inputCls} placeholder="8080" />
              </div>
              <div className={`rounded-xl border p-3 text-xs leading-relaxed
                ${isDark ? 'bg-[#0f1117] border-surface-border text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                <span className="text-accent-light font-medium">IP Webcam (Android): </span>
                abre la app → <em>Iniciar servidor</em> → copia la IP. Misma red WiFi que el PC.
                <br />
                <span className="opacity-60 mt-1 block">
                  URL: http://{form.ip || '···'}:{form.puerto || '···'}/video
                </span>
              </div>
            </div>
          )}

          {form.tipo === 'rtsp' && (
            <div>
              <label className={labelCls}>URL del stream</label>
              <input type="text" value={form.url_personalizada} onChange={set('url_personalizada')}
                className={inputCls} placeholder="rtsp://user:pass@192.168.1.x:554/stream" />
              <p className={`text-xs mt-1.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                También acepta URLs MJPEG (http://…/video)
              </p>
            </div>
          )}

          {/* Feedback */}
          {feedback && (
            <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2.5 border
              ${feedback.ok
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              {feedback.ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {feedback.msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 px-5 py-4 border-t
          ${isDark ? 'border-surface-border' : 'border-slate-100'}`}>
          <button onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm transition-all
              ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
            Cancelar
          </button>
          <button onClick={handleAplicar} disabled={cargando}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-accent hover:bg-accent/90 text-white
              disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2">
            {cargando
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Aplicando...</>
              : <><Check className="w-3.5 h-3.5" />Conectar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: Stream de cámara con reconexión automática
// ─────────────────────────────────────────────────────────────────────────────
function CamaraStream({ isDark, conectado }: { isDark: boolean; conectado: boolean }) {
  const [streamKey, setStreamKey] = useState(Date.now());
  const errCountRef = useRef(0);

  // Al reconectar desde el config panel, forzamos nueva key
  useEffect(() => {
    if (conectado) {
      setStreamKey(Date.now());
      errCountRef.current = 0;
    }
  }, [conectado]);

  const handleError = () => {
    errCountRef.current += 1;
    const delay = Math.min(1000 * errCountRef.current, 8000);
    setTimeout(() => setStreamKey(Date.now()), delay);
  };

  return (
    <div className="rounded-lg overflow-hidden border border-slate-700 relative bg-black">
      {/* Indicador en vivo */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5
        bg-black/50 backdrop-blur-sm rounded px-2 py-1">
        <span className={`w-1.5 h-1.5 rounded-full ${conectado ? 'bg-green-400 animate-pulse' : 'bg-orange-400'}`} />
        <span className="text-[10px] font-medium text-white/80">
          {conectado ? 'En vivo' : 'Sin señal'}
        </span>
      </div>

      <img
        key={streamKey}
        src={`${API_BASE}/video_feed`}
        alt="Camera stream"
        className="w-full h-auto"
        onError={handleError}
        onLoad={() => { errCountRef.current = 0; }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { isDark } = useTheme();
  const { user, logout } = useAuth();

  // ── Estado de detecciones ──────────────────────────────────────────────────
  // Mantenemos tu tipado estricto <Deteccion[]> en lugar de any[]
  const [historial, setHistorial] = useState<Deteccion[]>([]);

  // PARA EVITAR DUPLICADOS (Traído de tu amigo)
  const ultimaPlacaGuardada = useRef<string>("");

  // ── Estado del servidor / cámara ───────────────────────────────────────────
  const [status, setStatus] = useState<ServerStatus | null>(null);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const [showConfig, setShowConfig] = useState(false);

  // ── FUNCIÓN PARA GUARDAR EN SUPABASE (Traído de tu amigo) ──────────────────
  const registrarVehiculo = async (placa: string, dueno: string) => {
    const { error } = await supabase
      .from('vehiculos')
      .insert([{ placa, dueno }]);

    if (error) {
      console.error("Error guardando:", error.message);
    } else {
      console.log("Vehículo guardado :", placa);
    }
  };

  // ── CONEXIÓN CON FLASK + GUARDADO ─────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        // 1. Consultamos Flask para las detecciones (Cambio de tu amigo) y tu API para el estatus en paralelo
        const respuesta = await fetch('http://localhost:5000/api/detecciones');
        const datos = await respuesta.json();
        
        const estado = await api.getStatus(); // Mantenemos tu verificación de estado

        setHistorial(datos);
        setStatus(estado);

        // 2. Lógica de tu amigo: GUARDAR SOLO LA ÚLTIMA PLACA EN SUPABASE SIN DUPLICAR
        if (datos.length > 0) {
          const placa = datos[0].placa;

          if (placa && placa !== ultimaPlacaGuardada.current) {
            await registrarVehiculo(placa, "Desconocido");
            ultimaPlacaGuardada.current = placa;
          }
        }

      } catch (error) {
        console.error("Error en el polling:", error);
        // Mantenemos tu manejo de estado cuando el servidor se cae
        setStatus(prev => prev ? { ...prev, conectado: false } : null);
      }
    };

    poll();
    // Lo dejamos a 1 o 2 segundos según prefieran (1000ms es más rápido para detectar autos)
    const intervalo = setInterval(poll, 1000); 
    return () => clearInterval(intervalo);
  }, []);

  // ── Datos derivados ────────────────────────────────────────────────────────
  const ultimaDeteccion = historial[0];
  const conectado = status?.conectado ?? false;

// ── Estadísticas (en el futuro vendrán de la BD) ───────────────────────────
  // TODO (BD): calcular `deteccionesHoy` con WHERE fecha = hoy
  //            y `precisionPromedio` con AVG(precision_ocr)
  const stats = [
    { label: 'Cámaras activas',       value: conectado ? '1' : '0', icon: Monitor },
    { label: 'Detecciones hoy',       value: historial.length.toString(), icon: Activity },
    { label: 'Vehículos registrados', value: historial.length.toString(), icon: Car },
    { 
      label: 'Precisión promedio', 
      value: ultimaDeteccion ? `${ultimaDeteccion.precision_ocr}%` : '--', 
      icon: Cpu 
    },
  ];

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0f1117]' : 'bg-[#F8FAFC]'}`}>
      
      {/* ── Top bar ── */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b
        ${isDark ? 'bg-[#0f1117]/80 border-surface-border' : 'bg-white/80 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <ScanLine className={`w-7 h-7 ${isDark ? 'text-accent-light' : 'text-slate-800'}`} />
            <span className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Vision<span className="text-accent-light">G</span>
              <span className={`${isDark ? 'text-slate-500' : 'text-slate-400'} font-medium ml-1.5`}>LPR</span>
            </span>
          </Link>
<div className="flex items-center gap-3">
            {/* Badge estado conexión (Mantenemos el tuyo) */}
            <div className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border
              ${conectado
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}`}>
              {conectado ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {conectado ? 'Conectado' : 'Sin señal'}
            </div>

            {/* Botón configurar cámara (Mantenemos el tuyo) */}
            <button
              onClick={() => setShowConfig(true)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all border
                ${isDark
                  ? 'border-surface-border text-slate-400 hover:text-white hover:bg-slate-800'
                  : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Cámara</span>
            </button>

            <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              {user?.email}
            </span>

            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200
                border border-transparent hover:border-red-500/30 text-red-400 hover:bg-red-500/10">
              <LogOut className="w-4 h-4" />
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        <h1 className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Dashboard
        </h1>
        <p className={`mt-1 text-sm font-light ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
          Bienvenido a tu panel de control
        </p>

        {/* ── Tarjetas de estadísticas ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {stats.map((stat, i) => (
            <div key={i} className={`rounded-xl p-5 border transition-all duration-300
              ${isDark ? 'bg-surface-raised border-surface-border' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-accent/8 border border-accent/15 flex items-center justify-center">
                  <stat.icon className="w-4 h-4 text-accent-light" />
                </div>
                <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {stat.label}
                </span>
              </div>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Panel LPR ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">

          {/* Stream en vivo (Mezclamos tus estilos con la ruta Flask de tu amigo) */}
          <div className={`rounded-xl p-6 border
            ${isDark ? 'bg-surface-raised border-surface-border' : 'bg-white border-slate-200'}`}>
            <h2 className={`text-base font-medium mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Cámara en vivo
            </h2>
            <div className="relative w-full rounded-lg overflow-hidden border border-slate-700">
              <img src="http://localhost:5000/video_feed" className="w-full h-auto" alt="Video feed Flask" />
            </div>

            {!conectado && status?.error && (
              <p className="text-xs text-orange-400 mt-2">{status.error}</p>
            )}
          </div>

          {/* Última detección (Tus estilos completos) */}
          <div className={`rounded-xl p-6 border
            ${isDark ? 'bg-surface-raised border-surface-border' : 'bg-white border-slate-200'}`}>
            <h2 className={`text-base font-medium mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Última detección
            </h2>

            {ultimaDeteccion ? (
              <div className="space-y-4">
                <img
                  src={ultimaDeteccion.foto}
                  alt="Frame YOLO"
                  className="w-full h-auto rounded-lg border border-slate-700"
                />
                <div className="p-3 text-center rounded-lg border border-dashed border-accent-light bg-accent/5">
                  <span className={`text-2xl font-mono font-bold tracking-wider
                    ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {ultimaDeteccion.placa}
                  </span>
                </div>
                <div className={`text-xs space-y-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <p><strong>Hora:</strong> {ultimaDeteccion.hora}</p>
                  <p><strong>Precisión OCR:</strong> {ultimaDeteccion.precision_ocr}%</p>
                  <p><strong>Confianza YOLO:</strong> {ultimaDeteccion.precision_yolo}%</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic text-center py-12">
                Esperando vehículos en cámara...
              </p>
            )}
          </div>

          {/* Historial de tránsito (Tu hermosa tabla estilizada) */}
          <div className={`rounded-xl p-6 border lg:col-span-3
            ${isDark ? 'bg-surface-raised border-surface-border' : 'bg-white border-slate-200'}`}>
            <h2 className={`text-base font-medium mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Historial de tránsito
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className={`border-b text-xs uppercase
                    ${isDark ? 'border-surface-border text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                    <th className="pb-3 pl-2">ID</th>
                    <th className="pb-3">Hora</th>
                    <th className="pb-3">Matrícula</th>
                    <th className="pb-3 text-right pr-2">Precisión OCR</th>
                  </tr>
                </thead>
                <tbody className={`divide-y
                  ${isDark ? 'divide-surface-border text-slate-300' : 'divide-slate-100 text-slate-700'}`}>
                  {historial.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/5">
                      <td className="py-3.5 pl-2 font-medium">#{item.id}</td>
                      <td className="py-3.5">{item.hora}</td>
                      <td className="py-3.5 font-mono font-bold text-accent-light text-base tracking-wider">
                        {item.placa}
                      </td>
                      <td className="py-3.5 text-right pr-2 text-green-500 font-medium">
                        {item.precision_ocr}%
                      </td>
                    </tr>
                  ))}

                  {historial.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-slate-500 italic">
                        No hay registros hoy.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>

      {/* ── Modal configuración cámara (Mantenemos el tuyo) ── */}
      {showConfig && (
        <ConfigCamaraModal
          isDark={isDark}
          configActual={status?.config}
          onClose={() => setShowConfig(false)}
          onAplicar={() => setShowConfig(false)}
        />
      )}
    </div>
  );
}