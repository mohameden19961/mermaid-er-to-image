(function () {
  const codeInput = document.getElementById('code-input');
  const mermaidContainer = document.getElementById('mermaid-container');
  const emptyState = document.getElementById('empty-state');
  const errorState = document.getElementById('error-state');
  const errorMessage = document.getElementById('error-message');
  const downloadPngBtn = document.getElementById('download-png-btn');
  const downloadSvgBtn = document.getElementById('download-svg-btn');
  const loadExampleBtn = document.getElementById('load-example-btn');
  const clearBtn = document.getElementById('clear-btn');

  const EXAMPLE_CODE = `erDiagram
    LANGUAGE {
        string code PK
        string name
    }
    NATIONALITY {
        string code PK
        string name
    }
    CATEGORY {
        bigint id PK
        string name
        boolean deleted
    }
    PUBLISHER {
        bigint id PK
        string name
        string email
        boolean deleted
    }
    AUTHOR {
        bigint id PK
        string name
        string nationality_code FK
        boolean deleted
    }
    BOOK {
        bigint id PK
        string title
        string isbn
        string language_code FK
        bigint category_id FK
        bigint publisher_id FK
        boolean deleted
    }
    BOOK_ITEM {
        bigint id PK
        string barcode
        string status
        bigint version
        boolean deleted
    }
    MEMBER {
        bigint id PK
        string email
        string member_type
        int max_borrows
        boolean deleted
    }
    BOOK_AUTHOR {
        bigint book_id PK, FK
        bigint author_id PK, FK
        string role
    }
    RESERVATION {
        bigint id PK
        bigint member_id FK
        bigint book_id FK
        int queue_position
        string status
    }
    BORROW {
        bigint id PK
        bigint member_id FK
        bigint book_item_id FK
        int renewal_count
        string status
    }

    LANGUAGE ||--o{ BOOK : "possède"
    NATIONALITY ||--o{ AUTHOR : "a"
    CATEGORY ||--o{ BOOK : "contient"
    PUBLISHER ||--o{ BOOK : "publie"
    BOOK ||--o{ BOOK_AUTHOR : "rédigé par"
    AUTHOR ||--o{ BOOK_AUTHOR : "a rédigé"
    BOOK ||--o{ BOOK_ITEM : "contient exemplaires"
    MEMBER ||--o{ BORROW : "effectue"
    BOOK_ITEM ||--o{ BORROW : "est associé à"
    MEMBER ||--o{ RESERVATION : "fait"
    BOOK ||--o{ RESERVATION : "est concerné par"`;

  let lastSvg = null;

  mermaid.initialize({
    theme: 'dark',
    themeVariables: {
      primaryColor: '#1e293b',
      primaryTextColor: '#f1f5f9',
      primaryBorderColor: '#38bdf8',
      lineColor: '#64748b',
      secondaryColor: '#334155',
      tertiaryColor: '#0f172a',
      fontFamily: 'system-ui, sans-serif',
    },
    securityLevel: 'loose',
    startOnLoad: false,
  });

  function showEmpty() {
    emptyState.classList.remove('hidden');
    errorState.classList.add('hidden');
    mermaidContainer.innerHTML = '';
    mermaidContainer.appendChild(emptyState);
    downloadPngBtn.disabled = true;
    downloadSvgBtn.disabled = true;
    lastSvg = null;
  }

  function showError(msg) {
    emptyState.classList.add('hidden');
    errorState.classList.remove('hidden');
    mermaidContainer.innerHTML = '';
    errorMessage.textContent = msg;
    mermaidContainer.appendChild(errorState);
    downloadPngBtn.disabled = true;
    downloadSvgBtn.disabled = true;
    lastSvg = null;
  }

  async function renderDiagram(code) {
    const trimmed = code.trim();
    if (!trimmed) {
      showEmpty();
      return;
    }

    try {
      const { svg } = await mermaid.render('mermaid-svg-' + Date.now(), trimmed);
      emptyState.classList.add('hidden');
      errorState.classList.add('hidden');
      mermaidContainer.innerHTML = svg;
      lastSvg = svg;
      downloadPngBtn.disabled = false;
      downloadSvgBtn.disabled = false;
    } catch (err) {
      console.error('Mermaid render error:', err);
      showError(err.message || 'Invalid Mermaid syntax.');
    }
  }

  function downloadAsSvg() {
    if (!lastSvg) return;
    const blob = new Blob([lastSvg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, 'diagram.svg');
  }

  function downloadAsPng() {
    if (!lastSvg) return;

    const container = mermaidContainer.querySelector('svg');
    if (!container) return;

    const svgData = lastSvg;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = svgData;
    const svgEl = tempContainer.querySelector('svg');
    const origWidth = parseFloat(svgEl.getAttribute('width'));
    const origHeight = parseFloat(svgEl.getAttribute('height'));
    const scale = 3;
    const w = Math.round(origWidth * scale);
    const h = Math.round(origHeight * scale);

    canvas.width = w;
    canvas.height = h;

    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = function () {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);

      canvas.toBlob(function (pngBlob) {
        if (pngBlob) {
          downloadBlob(pngBlob, 'diagram.png');
        }
      }, 'image/png');
    };

    img.onerror = function () {
      fallbackPngDownload();
    };

    img.src = url;
  }

  function fallbackPngDownload() {
    const svgEl = mermaidContainer.querySelector('svg');
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const origWidth = parseFloat(svgEl.getAttribute('width')) || 800;
    const origHeight = parseFloat(svgEl.getAttribute('height')) || 600;
    const scale = 3;
    canvas.width = Math.round(origWidth * scale);
    canvas.height = Math.round(origHeight * scale);

    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = function () {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (pngBlob) {
        if (pngBlob) downloadBlob(pngBlob, 'diagram.png');
      }, 'image/png');
    };

    img.src = url;
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blob);
  }

  let renderTimeout = null;
  function scheduleRender() {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => renderDiagram(codeInput.value), 350);
  }

  codeInput.addEventListener('input', scheduleRender);

  loadExampleBtn.addEventListener('click', function () {
    codeInput.value = EXAMPLE_CODE;
    scheduleRender();
  });

  clearBtn.addEventListener('click', function () {
    codeInput.value = '';
    showEmpty();
  });

  downloadSvgBtn.addEventListener('click', downloadAsSvg);
  downloadPngBtn.addEventListener('click', downloadAsPng);

  showEmpty();
})();
