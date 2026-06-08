UiniKey

UiniKey es una plataforma educativa y tecnológica enfocada en la soberanía financiera, la autocustodia de Bitcoin y la construcción de configuraciones avanzadas de seguridad utilizando estándares abiertos del ecosistema Bitcoin.

La plataforma permite diseñar esquemas de multifirma (multisig), aplicar timelocks, generar descriptores compatibles con wallets modernas, visualizar direcciones derivadas y analizar archivos PSBT de manera intuitiva.

Características

Gestión de llaves (xpubs)

- Soporte para xpub, ypub y zpub.
- Detección y validación de fingerprints.
- Gestión dinámica de firmantes.

Reglas de gasto

- Configuración M-de-N.
- Timelocks relativos.
- Timelocks absolutos.
- Combinaciones avanzadas mediante Miniscript.

Generación de descriptores

- Descriptores compatibles con estándares modernos.
- Soporte para P2WSH.
- Compatibilidad con configuraciones Miniscript.
- Exportación y copia rápida.

Derivación de direcciones

- Generación de direcciones SegWit.
- Generación de direcciones Taproot.
- Visualización de múltiples direcciones derivadas.
- Copia rápida al portapapeles.

Análisis de PSBT

- Carga manual o mediante archivo.
- Validación de estructura.
- Visualización de entradas y salidas.
- Estado de firmas.
- Preparación para procesos de firma multifirma.

Tecnologías utilizadas

Frontend

- HTML5
- CSS3
- JavaScript (Vanilla JS)

Bitcoin

- Bitcoin Descriptors
- Miniscript
- PSBT
- P2WSH
- Taproot
- SegWit

Librerías

- BitcoinVault
- VaultBackend (WebAssembly)

Estructura del proyecto

/
├── assets/
├── css/
│   ├── styles.css
│   ├── legal.css
│   └── builder/
├── js/
│   ├── main.js
│   └── builder/
├── index.html
├── builder.html
├── terminos.html
└── privacidad.html

Ejecución local

Debido al uso de WebAssembly y módulos de Bitcoin, el proyecto debe ejecutarse mediante un servidor local.

Ejemplo utilizando Visual Studio Code:

1. Instalar la extensión Live Server.
2. Abrir el proyecto.
3. Ejecutar "Open with Live Server".

No se recomienda abrir los archivos HTML directamente mediante "file://".

Aviso

UiniKey es una herramienta educativa y de apoyo para la creación de configuraciones de seguridad en Bitcoin.

La plataforma:

- No custodia fondos.
- No almacena claves privadas.
- No solicita frases semilla.
- No actúa como entidad financiera.

La responsabilidad final sobre la protección de los activos digitales corresponde exclusivamente al propietario de las claves.

Licencia

Todos los derechos reservados.

© UiniKey
