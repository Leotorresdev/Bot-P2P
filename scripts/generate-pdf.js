const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Cargar imagen como base64
const imgPath = path.join(__dirname, '../docs/pantalla_binance.jpg');
let imgBase64 = '';
if (fs.existsSync(imgPath)) {
  const imgBuffer = fs.readFileSync(imgPath);
  imgBase64 = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;
}

const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Guía Paso a Paso — Bot P2P Venezuela</title>
  <style>
    @page {
      size: A4;
      margin: 14mm 16mm 14mm 16mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1e293b;
      background-color: #ffffff;
      line-height: 1.5;
      font-size: 13px;
    }

    .header-banner {
      background: linear-gradient(135deg, #064e3b 0%, #047857 50%, #0d9488 100%);
      color: white;
      padding: 24px 28px;
      border-radius: 14px;
      margin-bottom: 22px;
      box-shadow: 0 4px 12px rgba(6, 78, 59, 0.15);
    }

    .badge-pill {
      display: inline-block;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.35);
      color: #ecfdf5;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }

    h1 {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      line-height: 1.2;
      margin-bottom: 6px;
    }

    .subtitle {
      font-size: 13px;
      color: #d1fae5;
      font-weight: 400;
      max-width: 90%;
      line-height: 1.4;
    }

    .step-card {
      background: #ffffff;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: 18px;
      page-break-inside: avoid;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
    }

    .step-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 10px;
    }

    .step-number {
      width: 32px;
      height: 32px;
      background: #059669;
      color: white;
      font-weight: 800;
      font-size: 15px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .step-title {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
    }

    .step-desc {
      font-size: 13px;
      color: #475569;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .instructions-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 9px;
    }

    .instructions-list li {
      position: relative;
      padding-left: 24px;
      color: #334155;
      font-size: 12.5px;
      line-height: 1.45;
    }

    .instructions-list li::before {
      content: "•";
      position: absolute;
      left: 8px;
      top: 0;
      color: #059669;
      font-size: 18px;
      font-weight: bold;
      line-height: 1;
    }

    .box-info {
      background: #f0fdf4;
      border-left: 4px solid #10b981;
      padding: 10px 14px;
      border-radius: 6px;
      margin: 12px 0 6px 0;
      font-size: 12px;
      color: #065f46;
    }

    .box-warning {
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      padding: 10px 14px;
      border-radius: 6px;
      margin: 12px 0 6px 0;
      font-size: 12px;
      color: #92400e;
    }

    .box-security {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px 14px;
      margin: 12px 0;
    }

    .security-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-top: 8px;
    }

    .sec-item {
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 11.5px;
    }

    .sec-ok {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #065f46;
    }

    .sec-no {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
    }

    .sec-title {
      font-weight: 700;
      display: block;
      margin-bottom: 2px;
    }

    .image-container {
      margin: 14px 0 6px 0;
      text-align: center;
      background: #f8fafc;
      padding: 8px;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
    }

    .image-container img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .caption {
      font-size: 11px;
      color: #64748b;
      margin-top: 6px;
      font-style: italic;
    }

    .footer {
      text-align: center;
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #94a3b8;
    }

    .code-pill {
      font-family: monospace;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      color: #0f172a;
      font-weight: 600;
    }

    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>

  <!-- BANNER PRINCIPAL -->
  <div class="header-banner">
    <div class="badge-pill">Guía de Uso para el Comerciante</div>
    <h1>Bot P2P Venezuela — Manual Rápido y Sencillo</h1>
    <p class="subtitle">
      Aprende en menos de 5 minutos a registrarte, iniciar sesión con tu teléfono y conectar Binance para que el bot lleve tus cuentas de forma 100% segura.
    </p>
  </div>

  <!-- PASO 1 -->
  <div class="step-card">
    <div class="step-header">
      <div class="step-number">1</div>
      <div class="step-title">Cómo Registrar tu Cuenta por Primera Vez</div>
    </div>
    <p class="step-desc">
      El registro solo se hace una sola vez para crear tu perfil de operador comercial en el sistema.
    </p>
    <ul class="instructions-list">
      <li>
        <strong>Entra a la página de registro:</strong> En tu navegador ve a <span class="code-pill">http://localhost:3000/register</span> (o si estás en la pantalla de inicio, haz clic abajo en <em>"Crear cuenta nueva"</em>).
      </li>
      <li>
        <strong>Escribe tus datos:</strong> Coloca tu nombre o el de tu negocio (ejemplo: <em>Inversiones Lara</em>), tu correo electrónico y una contraseña segura que recuerdes.
      </li>
      <li>
        <strong>Tu Llave de Google Authenticator (La seguridad de tu teléfono):</strong>
        <br>
        Al hacer clic en <em>"Crear mi Cuenta de Operador"</em>, la pantalla te mostrará un código de letras y números con un botón <strong>"Copiar"</strong>.
      </li>
      <li>
        <strong>Pega esa clave en tu celular:</strong>
        Abre la aplicación <strong>Google Authenticator</strong> en tu teléfono (si no la tienes, descárgala gratis en Play Store o App Store). Toca el botón <strong>(+)</strong> abajo a la derecha, elige <strong>"Ingresar clave de configuración"</strong>, escribe de nombre <em>Bot P2P</em> y pega la clave copiada.
      </li>
      <li>
        <strong>Entra al sistema:</strong>
        En la pantalla del bot pulsa el botón verde: <strong>"Ya guardé mi clave • Entrar a mi Panel P2P"</strong>. ¡Listo! Ya estás adentro.
      </li>
    </ul>

    <div class="box-info">
      💡 <strong>¿Por qué usamos Google Authenticator?</strong> Es igual a la clave dinámica de tu banco. Garantiza que nadie pueda entrar a revisar tus números ni tus ganancias a menos que tenga tu teléfono en la mano.
    </div>
  </div>

  <!-- PASO 2 -->
  <div class="step-card">
    <div class="step-header">
      <div class="step-number">2</div>
      <div class="step-title">Cómo Iniciar Sesión Cada Día (Login)</div>
    </div>
    <p class="step-desc">
      Cuando cierres tu sesión o entres desde otra computadora, el proceso de entrada es muy fácil y rápido:
    </p>
    <ul class="instructions-list">
      <li>
        Entra a <strong>http://localhost:3000/login</strong>.
      </li>
      <li>
        Escribe tu <strong>Correo Electrónico</strong> y tu <strong>Contraseña</strong>.
      </li>
      <li>
        Abre la app <strong>Google Authenticator</strong> en tu celular y escribe los <strong>6 números</strong> que te muestra en ese momento (esos números cambian solos cada 30 segundos por seguridad).
      </li>
      <li>
        Haz clic en el botón verde <strong>"Entrar al Sistema →"</strong>.
      </li>
    </ul>
  </div>

  <!-- SALTO DE PÁGINA PARA QUE EL PASO 3 Y 4 QUEDEN PERFECTOS JUNTOS -->
  <div class="page-break"></div>

  <!-- PASO 3 -->
  <div class="step-card">
    <div class="step-header">
      <div class="step-number">3</div>
      <div class="step-title">Cómo Sacar tus Claves en Binance (Solo Lectura)</div>
    </div>
    <p class="step-desc">
      Para que el bot pueda ver tus compras y ventas y calcular cuánto ganaste, necesita una llave de Binance. Esta llave está <strong>100% blindada</strong>:
    </p>

    <!-- SEMÁFORO DE SEGURIDAD -->
    <div class="box-security">
      <strong style="color: #0f172a; font-size: 12px;">Tu dinero NUNCA corre peligro:</strong>
      <div class="security-grid">
        <div class="sec-item sec-ok">
          <span class="sec-title">✅ Permitido: Solo Lectura</span>
          El bot solo mira tus compras y ventas para sumar tus ganancias en Bs. y USDT.
        </div>
        <div class="sec-item sec-no">
          <span class="sec-title">❌ Bloqueado: Retirar Dinero</span>
          Es totalmente imposible que el bot saque o mueva dinero de tu Binance.
        </div>
        <div class="sec-item sec-no">
          <span class="sec-title">❌ Bloqueado: Hacer Trading</span>
          No puede abrir órdenes, vender ni comprar en el mercado por su cuenta.
        </div>
      </div>
    </div>

    <ul class="instructions-list">
      <li>
        <strong>Entra a Binance:</strong> En tu computadora, ve a la web de Binance y haz clic en el <strong>icono de tu perfil</strong> (arriba a la derecha).
      </li>
      <li>
        <strong>Ve a Gestión de API:</strong> En el menú desplegable, haz clic en <strong>"Gestión de API"</strong> (<em>API Management</em>).
      </li>
      <li>
        <strong>Crea la Clave:</strong> Haz clic en el botón amarillo <strong>"Crear API"</strong> y selecciona la opción <em>"Generada por el sistema"</em>. Ponle de nombre: <span class="code-pill">Bot P2P</span>.
      </li>
      <li>
        <strong>Pasa la verificación:</strong> Ingresa los códigos que Binance te envíe por seguridad a tu teléfono o correo.
      </li>
      <li>
        <strong>REGLA DE ORO DE SEGURIDAD (Los Permisos):</strong>
        <br>
        En la lista de casillas de permisos, deja marcada <strong>ÚNICAMENTE</strong> la que dice <strong>"Habilitar lectura"</strong> (<em>Enable Reading</em>). 
        <br>
        <span style="color: #b91c1c; font-weight: bold;">¡NUNCA marques la casilla de "Habilitar Retiros"! Déjala siempre desactivada.</span>
      </li>
      <li>
        <strong>Copia tus 2 claves:</strong> Binance te mostrará en pantalla:
        <br>
        1. <strong>API Key</strong> (código largo de letras y números).
        <br>
        2. <strong>Secret Key</strong> (clave secreta). <em>¡Cópialas de inmediato porque Binance no vuelve a mostrar la Secret Key si sales de la página!</em>
      </li>
    </ul>
  </div>

  <!-- PASO 4 -->
  <div class="step-card">
    <div class="step-header">
      <div class="step-number">4</div>
      <div class="step-title">Cómo Conectar tus Claves en la Pantalla del Bot</div>
    </div>
    <p class="step-desc">
      Ahora solo falta pegar esas dos claves en la sección de <strong>Bóveda y Seguridad</strong> del bot como se muestra en la siguiente pantalla:
    </p>

    <!-- IMAGEN ADJUNTA DEL BOT -->
    ${imgBase64 ? `
    <div class="image-container">
      <img src="${imgBase64}" alt="Pantalla de Conexión de Binance en el Bot P2P" />
      <div class="caption">Pantalla del Bot P2P donde se conectan las claves de solo lectura y se ven los cierres contables.</div>
    </div>
    ` : ''}

    <ul class="instructions-list" style="margin-top: 14px;">
      <li>
        <strong>En el campo 1 ("Pega tu API Key de Binance"):</strong> Pega la API Key que copiaste de Binance.
      </li>
      <li>
        <strong>En el campo 2 ("Pega tu Secret Key"):</strong> Pega la Secret Key (se verá en puntitos <span class="code-pill">••••••••</span> para que nadie detrás de ti la vea).
      </li>
      <li>
        <strong>Guarda las claves:</strong> Haz clic en el botón verde <strong>"Guardar Nuevas Claves"</strong>. El bot la guardará en su bóveda encriptada.
      </li>
      <li>
        <strong>Comprueba que funciona:</strong> Pulsa el botón <strong>"Probar Conexión"</strong>. En segundos verás un mensaje verde que dice <strong>"¡Conexión Perfecta!"</strong>.
      </li>
    </ul>

    <div class="box-info">
      ✨ <strong>¡Y listo! A partir de este momento:</strong>
      <br>
      • El bot resta automáticamente la comisión oficial de Binance del <strong>0.163%</strong> en cada compra y venta.
      <br>
      • Separa el <strong>16% de IVA SENIAT</strong> únicamente sobre tu margen de ganancia libre (sin tocar tu capital de compra).
      <br>
      • A las <strong>11:59 PM (hora de Venezuela)</strong> todos los días genera tu cierre contable oficial y te permite descargar el resumen en Excel con un solo clic.
    </div>
  </div>

  <div class="footer">
    Bot P2P Venezuela • Manual de Operador Comercial • Diseñado para Comerciantes de Binance P2P
  </div>

</body>
</html>
`;

const htmlFilePath = path.join(__dirname, '../docs/guia_usuario.html');
fs.writeFileSync(htmlFilePath, htmlContent, 'utf-8');
console.log('HTML generado con éxito en:', htmlFilePath);

// 2. Ejecutar Chrome para generar el PDF
const pdfOutputPath = path.join(__dirname, '../docs/Guia_Paso_a_Paso_Bot_P2P.pdf');
const rootPdfPath = path.join(__dirname, '../Guia_Paso_a_Paso_Bot_P2P.pdf');
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

try {
  console.log('Generando PDF con Google Chrome...');
  const cmd = `"${chromePath}" --headless --disable-gpu --print-to-pdf="${pdfOutputPath}" --no-pdf-header-footer "${htmlFilePath}"`;
  execSync(cmd, { stdio: 'inherit' });
  console.log('PDF generado en docs:', pdfOutputPath);

  // Copiar también a la raíz para fácil acceso del usuario
  fs.copyFileSync(pdfOutputPath, rootPdfPath);
  console.log('PDF copiado a la raíz del proyecto:', rootPdfPath);
} catch (err) {
  console.error('Error al generar PDF con Chrome:', err);
  process.exit(1);
}
