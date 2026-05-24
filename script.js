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
  const importJsonBtn = document.getElementById('import-json-btn');
  const jsonFileInput = document.getElementById('json-file-input');

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
    theme: 'default',
    themeVariables: {
      primaryColor: '#eff6ff',
      primaryTextColor: '#1e3a5f',
      primaryBorderColor: '#3b82f6',
      lineColor: '#64748b',
      secondaryColor: '#f8fafc',
      tertiaryColor: '#ffffff',
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

    if (trimmed[0] === '{' || trimmed[0] === '[') {
      try {
        const json = JSON.parse(trimmed);
        const mermaidCode = parseJsonSchemaToMermaid(json);
        codeInput.value = mermaidCode;
        return renderDiagram(mermaidCode);
      } catch (e) {
        if (e instanceof SyntaxError) {
          // not JSON, fall through
        } else {
          showError('JSON Error: ' + e.message);
          return;
        }
      }
    }

    if (/CREATE\s+TABLE/i.test(trimmed)) {
      try {
        const mermaidCode = parseSqlToMermaid(trimmed);
        codeInput.value = mermaidCode;
        return renderDiagram(mermaidCode);
      } catch (e) {
        showError('SQL Error: ' + e.message);
        return;
      }
    }

    // Auto-add relationship lines from column naming conventions
    const enhanced = enhanceMermaidWithRelations(trimmed);
    if (enhanced !== trimmed) {
      codeInput.value = enhanced;
    }

    try {
      const { svg } = await mermaid.render('mermaid-svg-' + Date.now(), enhanced);
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
    const svg = ensureSvgNamespace(lastSvg);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, 'er-diagram.svg');
  }

  function ensureSvgNamespace(svg) {
    if (svg.includes('xmlns="http://www.w3.org/2000/svg"')) return svg;
    return svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  function downloadAsPng() {
    if (!lastSvg) return;

    const svgData = ensureSvgNamespace(lastSvg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const origWidth = lastSvg.match(/width="([^"]+)"/);
    const origHeight = lastSvg.match(/height="([^"]+)"/);
    const w = origWidth ? Math.round(parseFloat(origWidth[1]) * 3) : 2400;
    const h = origHeight ? Math.round(parseFloat(origHeight[1]) * 3) : 1800;
    canvas.width = w;
    canvas.height = h;

    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = function () {
      try {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (pngBlob) {
          if (pngBlob) {
            downloadBlob(pngBlob, 'er-diagram.png');
          } else {
            downloadAsSvg();
          }
        }, 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
        downloadAsSvg();
      }
    };

    img.onerror = function () {
      URL.revokeObjectURL(url);
      downloadAsSvg();
    };

    img.src = url;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function handleJsonFile(file) {
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      showError('Please select a .json file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const text = e.target.result;
      try {
        const json = JSON.parse(text);
        const mermaidCode = parseJsonSchemaToMermaid(json);
        codeInput.value = mermaidCode;
        renderDiagram(mermaidCode);
      } catch (err) {
        showError('JSON Error: ' + err.message);
      }
    };
    reader.onerror = function () {
      showError('Failed to read file.');
    };
    reader.readAsText(file);
  }

  importJsonBtn.addEventListener('click', function () {
    jsonFileInput.click();
  });

  jsonFileInput.addEventListener('change', function () {
    if (this.files && this.files[0]) {
      handleJsonFile(this.files[0]);
    }
    this.value = '';
  });

  // Drag and drop support
  const editorPanel = document.querySelector('.editor-panel');
  let dragCounter = 0;

  editorPanel.addEventListener('dragenter', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    editorPanel.classList.add('drag-over');
  });

  editorPanel.addEventListener('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
      editorPanel.classList.remove('drag-over');
    }
  });

  editorPanel.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });

  editorPanel.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    editorPanel.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleJsonFile(files[0]);
    }
  });

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
