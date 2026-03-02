const state = {
  docs: {
    A: null,
    B: null
  },
  compareResult: null,
  mode: 'text',
  sort: 'page',
  activeDoc: 'A',
  noticeTimer: null,
  selectedIndex: {
    text: 0,
    image: 0,
    metadata: 0,
    keyword: 0
  }
};

const refs = {
  compareBtn: document.getElementById('compareBtn'),
  exportBtn: document.getElementById('exportBtn'),
  resetBtn: document.getElementById('resetBtn'),
  noticeBar: document.getElementById('noticeBar'),
  noticeTitle: document.getElementById('noticeTitle'),
  noticeMessage: document.getElementById('noticeMessage'),
  noticeDismiss: document.getElementById('noticeDismiss'),
  overviewPanel: document.getElementById('overviewPanel'),
  workbench: document.getElementById('workbench'),
  overallScore: document.getElementById('overallScore'),
  exactScore: document.getElementById('exactScore'),
  fuzzyScore: document.getElementById('fuzzyScore'),
  anomalyCount: document.getElementById('anomalyCount'),
  riskLevel: document.getElementById('riskLevel'),
  docChipA: document.getElementById('docChipA'),
  docChipB: document.getElementById('docChipB'),
  sortSelect: document.getElementById('sortSelect'),
  tabButtons: Array.from(document.querySelectorAll('.tab-btn')),
  sidebarTitle: document.getElementById('sidebarTitle'),
  sidebarCount: document.getElementById('sidebarCount'),
  sidebarHint: document.getElementById('sidebarHint'),
  anomalyList: document.getElementById('anomalyList'),
  viewerTitleA: document.getElementById('viewerTitleA'),
  viewerTitleB: document.getElementById('viewerTitleB'),
  viewerPageA: document.getElementById('viewerPageA'),
  viewerPageB: document.getElementById('viewerPageB'),
  viewerMetaA: document.getElementById('viewerMetaA'),
  viewerMetaB: document.getElementById('viewerMetaB'),
  viewerBodyA: document.getElementById('viewerBodyA'),
  viewerBodyB: document.getElementById('viewerBodyB'),
  anomalyReason: document.getElementById('anomalyReason'),
  detailTextMode: document.getElementById('detailTextMode'),
  detailMetadataMode: document.getElementById('detailMetadataMode'),
  detailKeywordMode: document.getElementById('detailKeywordMode'),
  detailImageMode: document.getElementById('detailImageMode'),
  metadataWarnings: document.getElementById('metadataWarnings'),
  metadataTable: document.getElementById('metadataTable'),
  keywordList: document.getElementById('keywordList')
};

function $(id) {
  return document.getElementById(id);
}

function compactText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function formatFileSize(bytes) {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const size = bytes / (1024 ** index);
  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function severityLabel(severity) {
  if (severity === 'high') {
    return '高风险';
  }
  if (severity === 'medium') {
    return '中风险';
  }
  return '低风险';
}

function riskLabel(riskLevel) {
  if (riskLevel === 'high') {
    return '高风险';
  }
  if (riskLevel === 'medium') {
    return '中风险';
  }
  return '低风险';
}

function updateCompareButton() {
  refs.compareBtn.disabled = !(state.docs.A && state.docs.B);
}

function setStatus(side, text, isError = false) {
  const statusNode = $(`status${side}`);
  statusNode.textContent = text;
  statusNode.style.color = isError ? '#dc2626' : '#667085';
}

function hideNotice() {
  if (state.noticeTimer) {
    window.clearTimeout(state.noticeTimer);
    state.noticeTimer = null;
  }

  refs.noticeBar.classList.add('hidden');
  refs.noticeMessage.textContent = '';
}

function showNotice(message, options = {}) {
  const {
    type = 'info',
    title = type === 'error' ? '操作失败' : '提示',
    duration = type === 'error' ? 8000 : 5000
  } = options;

  if (state.noticeTimer) {
    window.clearTimeout(state.noticeTimer);
    state.noticeTimer = null;
  }

  refs.noticeBar.classList.remove('hidden', 'notice-info', 'notice-success', 'notice-error');
  refs.noticeBar.classList.add(`notice-${type}`);
  refs.noticeTitle.textContent = title;
  refs.noticeMessage.textContent = message;

  if (duration > 0) {
    state.noticeTimer = window.setTimeout(() => {
      hideNotice();
    }, duration);
  }
}

function updateFileCard(side, fileResult, doc) {
  $(`fileName${side}`).textContent = fileResult.name;
  $(`fileMeta${side}`).textContent = `${formatFileSize(fileResult.size)} · ${doc.metadata.pageCount} 页`;
  $(`meta${side}`).textContent = `作者: ${doc.metadata.author} · 创建者: ${doc.metadata.creator}`;
  setStatus(side, '已加载');
}

async function loadFile(side) {
  const pickButton = $(`pickFile${side}`);
  pickButton.disabled = true;
  hideNotice();
  setStatus(side, '读取中...');

  try {
    const openResult = await window.electronAPI.openFile();
    if (openResult.canceled || !openResult.filePaths.length) {
      setStatus(side, '');
      pickButton.disabled = false;
      return;
    }

    const filePath = openResult.filePaths[0];
    const fileResult = await window.electronAPI.readFile(filePath);
    if (!fileResult.success) {
      throw new Error(fileResult.error);
    }

    setStatus(side, '解析中...');

    const fileType = fileResult.name.split('.').pop().toLowerCase();
    const parseResult = await window.electronAPI.parseDocument({
      buffer: Array.from(fileResult.data),
      fileName: fileResult.name,
      fileType,
      createdAt: fileResult.createdAt,
      modifiedAt: fileResult.modifiedAt
    });

    if (!parseResult.success) {
      throw new Error(parseResult.error);
    }

    state.docs[side] = {
      file: fileResult,
      parsed: parseResult,
      buffer: fileResult.data // 保存原始buffer用于渲染PDF页面
    };

    updateFileCard(side, fileResult, parseResult);
    updateCompareButton();
  } catch (error) {
    setStatus(side, `失败: ${error.message}`, true);
    showNotice(`文件加载失败：${error.message}`, {
      type: 'error',
      title: `标书 ${side} 加载失败`
    });
  } finally {
    pickButton.disabled = false;
  }
}

function getModeItems() {
  if (!state.compareResult) {
    return [];
  }

  if (state.mode === 'text') {
    const items = [...state.compareResult.textAnomalies];
    if (state.sort === 'score') {
      items.sort((left, right) => right.score - left.score);
      return items;
    }

    if (state.sort === 'severity') {
      const order = { high: 3, medium: 2, low: 1 };
      items.sort((left, right) => {
        const severityDiff = order[right.severity] - order[left.severity];
        if (severityDiff !== 0) {
          return severityDiff;
        }
        return right.score - left.score;
      });
      return items;
    }

    items.sort((left, right) => {
      const leftPage = state.activeDoc === 'A' ? left.pageA : left.pageB;
      const rightPage = state.activeDoc === 'A' ? right.pageA : right.pageB;
      return leftPage - rightPage || right.score - left.score;
    });
    return items;
  }

  if (state.mode === 'metadata') {
    return [...state.compareResult.metadataWarnings];
  }

  if (state.mode === 'keyword') {
    return [...state.compareResult.keywordMatches].sort((left, right) => right.score - left.score);
  }

  return [];
}

function getSelectedItem(items) {
  if (!items.length) {
    return null;
  }

  const currentIndex = Math.min(
    state.selectedIndex[state.mode] || 0,
    items.length - 1
  );

  state.selectedIndex[state.mode] = currentIndex;
  return items[currentIndex];
}

function setActiveTab() {
  refs.tabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === state.mode);
  });

  refs.detailTextMode.classList.toggle('hidden', state.mode !== 'text');
  refs.detailMetadataMode.classList.toggle('hidden', state.mode !== 'metadata');
  refs.detailKeywordMode.classList.toggle('hidden', state.mode !== 'keyword');
  refs.detailImageMode.classList.toggle('hidden', state.mode !== 'image');
}

function setActiveDocChip() {
  refs.docChipA.classList.toggle('active', state.activeDoc === 'A');
  refs.docChipB.classList.toggle('active', state.activeDoc === 'B');
}

function renderSidebar(items) {
  refs.anomalyList.replaceChildren();
  refs.sidebarHint.classList.add('hidden');

  const titles = {
    text: '异常目录',
    image: '图片异常',
    metadata: '作者雷同',
    keyword: '关键字目录'
  };

  refs.sidebarTitle.textContent = titles[state.mode];
  refs.sidebarCount.textContent = `${items.length} 项`;

  if (!items.length) {
    refs.sidebarHint.textContent = state.mode === 'image'
      ? '图片对比尚未启用。'
      : '当前模式暂无可展示结果。';
    refs.sidebarHint.classList.remove('hidden');
    return;
  }

  items.forEach((item, index) => {
    const row = createElement('button', 'anomaly-item');
    row.type = 'button';
    row.classList.toggle('active', index === state.selectedIndex[state.mode]);

    const topLine = createElement('div', 'anomaly-topline');
    const mainLabel = createElement('span');
    const rightLabel = createElement('span');

    if (state.mode === 'text') {
      mainLabel.textContent = `${item.groupLabel} · ${Math.round(item.score * 100)}%`;
      rightLabel.className = `severity-tag severity-${item.severity}`;
      rightLabel.textContent = severityLabel(item.severity);
    } else if (state.mode === 'metadata') {
      mainLabel.textContent = item.message;
      rightLabel.className = `severity-tag severity-${item.severity}`;
      rightLabel.textContent = severityLabel(item.severity);
    } else if (state.mode === 'keyword') {
      mainLabel.textContent = item.keyword;
      rightLabel.className = 'severity-tag severity-low';
      rightLabel.textContent = `重合 ${item.score}`;
    }

    topLine.append(mainLabel, rightLabel);

    const subLine = createElement('div', 'anomaly-subline');
    if (state.mode === 'text') {
      subLine.textContent = `A: P${item.pageA} · B: P${item.pageB}`;
    } else if (state.mode === 'metadata') {
      subLine.textContent = `${item.valueA || '-'} / ${item.valueB || '-'}`;
    } else if (state.mode === 'keyword') {
      subLine.textContent = `标书 A: ${item.countA} 次 · 标书 B: ${item.countB} 次`;
    }

    row.append(topLine, subLine);
    row.addEventListener('click', () => {
      state.selectedIndex[state.mode] = index;
      renderWorkbench();
    });

    refs.anomalyList.appendChild(row);
  });
}

// 用 <mark> 标签高亮文本中完全相同的子串
function highlightExactMatches(text, exactMatches, side = 'A') {
  if (!exactMatches || !exactMatches.length) {
    return text;
  }

  // 按起始位置排序，从后往前替换（避免位置偏移）
  const posKey = side === 'A' ? 'startA' : 'startB';
  const sorted = [...exactMatches].sort((a, b) => b[posKey] - a[posKey]);

  let result = text;
  for (const match of sorted) {
    const startPos = match[posKey] || 0;
    const endPos = startPos + match.length;
    const before = result.slice(0, startPos);
    const matched = result.slice(startPos, endPos);
    const after = result.slice(endPos);
    result = `${before}<mark class="exact-match">${matched}</mark>${after}`;
  }

  return result;
}

function fillViewer(container, blocks) {
  container.replaceChildren();

  if (!blocks.length) {
    container.classList.add('empty-state');
    container.textContent = '当前无可展示内容。';
    return;
  }

  container.classList.remove('empty-state');
  const fragment = document.createDocumentFragment();

  blocks.forEach((block) => {
    const wrapper = createElement(
      'div',
      `viewer-block${block.highlight ? ' highlight' : ''}`
    );

    const title = createElement('div', 'viewer-block-title', block.title);
    const body = document.createElement('div');
    if (block.html) {
      body.innerHTML = block.text;
    } else {
      body.textContent = block.text;
    }

    wrapper.append(title, body);
    fragment.appendChild(wrapper);
  });

  container.appendChild(fragment);
}

// 渲染PDF页面并叠加高亮
async function renderPdfPageWithHighlights(side, pageNumber, exactMatches, scale = 1.5) {
  const doc = state.docs[side];
  if (!doc || !doc.buffer) {
    return null;
  }

  const container = side === 'A' ? refs.viewerBodyA : refs.viewerBodyB;
  container.innerHTML = '<div class="pdf-loading">正在渲染页面...</div>';

  try {
    const result = await window.electronAPI.renderPdfPage(
      Array.from(doc.buffer),
      pageNumber,
      scale
    );

    if (!result.success) {
      container.innerHTML = `<div class="pdf-error">渲染失败: ${result.error}</div>`;
      return null;
    }

    // 创建容器
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';

    // 创建图片
    const img = document.createElement('img');
    img.src = result.image;
    img.className = 'pdf-page-image';
    img.style.width = `${result.width}px`;
    img.style.height = `${result.height}px`;

    // 创建高亮层
    const highlightLayer = document.createElement('div');
    highlightLayer.className = 'pdf-highlight-layer';
    highlightLayer.style.width = `${result.width}px`;
    highlightLayer.style.height = `${result.height}px`;

    // 获取该页的文本项坐标
    const pageTextItems = doc.parsed.metadata.pageTextItems?.[pageNumber] || [];

    // 根据exactMatches绘制高亮
    if (exactMatches && exactMatches.length > 0) {
      for (const match of exactMatches) {
        // 在pageTextItems中查找匹配的文本位置
        const matchText = match.textA || match.text;
        if (!matchText) continue;

        // 查找包含匹配文本的文本项
        for (const item of pageTextItems) {
          if (item.str && matchText.includes(item.str.substring(0, 20))) {
            const x = item.x * scale;
            const y = item.y * scale;
            const width = (item.width || item.str.length * 10) * scale;
            const height = (item.height || 12) * scale;

            const highlight = document.createElement('div');
            highlight.className = 'pdf-highlight-box';
            highlight.style.left = `${x}px`;
            highlight.style.top = `${y}px`;
            highlight.style.width = `${width}px`;
            highlight.style.height = `${height}px`;
            highlightLayer.appendChild(highlight);
          }
        }
      }
    }

    wrapper.appendChild(img);
    wrapper.appendChild(highlightLayer);
    container.replaceChildren(wrapper);

    return result;
  } catch (error) {
    container.innerHTML = `<div class="pdf-error">渲染失败: ${error.message}</div>`;
    return null;
  }
}

function renderTextMode(selectedItem) {
  refs.anomalyReason.textContent = selectedItem
    ? `${severityLabel(selectedItem.severity)} · 相似度 ${Math.round(selectedItem.score * 100)}% · ${selectedItem.reason}`
    : '当前未选择异常项。';

  refs.viewerTitleA.textContent = state.docs.A.file.name;
  refs.viewerTitleB.textContent = state.docs.B.file.name;

  if (!selectedItem) {
    refs.viewerPageA.textContent = '待定位';
    refs.viewerPageB.textContent = '待定位';
    refs.viewerMetaA.textContent = '当前模式暂无文本异常。';
    refs.viewerMetaB.textContent = '当前模式暂无文本异常。';
    fillViewer(refs.viewerBodyA, []);
    fillViewer(refs.viewerBodyB, []);
    return;
  }

  refs.viewerPageA.textContent = `P${selectedItem.pageA}`;
  refs.viewerPageB.textContent = `P${selectedItem.pageB}`;
  refs.viewerMetaA.textContent = `标书 A · 匹配段落`;
  refs.viewerMetaB.textContent = `标书 B · ${selectedItem.matchType === 'exact' ? '高相似' : '模糊相似'} ${Math.round(selectedItem.score * 100)}%`;

  // 检查文件类型，决定渲染方式
  const fileA = state.docs.A.file;
  const fileB = state.docs.B.file;
  const isPdfA = fileA.name.toLowerCase().endsWith('.pdf');
  const isPdfB = fileB.name.toLowerCase().endsWith('.pdf');

  if (isPdfA) {
    // 渲染PDF页面
    renderPdfPageWithHighlights('A', selectedItem.pageA, selectedItem.exactMatches);
  } else {
    // 非PDF，显示高亮文本
    const highlightedA = highlightExactMatches(selectedItem.textA, selectedItem.exactMatches, 'A');
    fillViewer(refs.viewerBodyA, [{
      title: `标书 A · 段落 P${selectedItem.pageA}`,
      text: highlightedA,
      highlight: true,
      html: true
    }]);
  }

  if (isPdfB) {
    // 渲染PDF页面
    renderPdfPageWithHighlights('B', selectedItem.pageB, selectedItem.exactMatches);
  } else {
    // 非PDF，显示高亮文本
    const highlightedB = highlightExactMatches(selectedItem.textB, selectedItem.exactMatches, 'B');
    fillViewer(refs.viewerBodyB, [{
      title: `标书 B · 段落 P${selectedItem.pageB}`,
      text: highlightedB,
      highlight: true,
      html: true
    }]);
  }
}

function renderMetadataTable() {
  refs.metadataWarnings.replaceChildren();
  refs.metadataTable.replaceChildren();

  const warnings = state.compareResult ? state.compareResult.metadataWarnings : [];
  if (!warnings.length) {
    refs.metadataWarnings.appendChild(
      createElement('div', 'info-pill', '当前未发现明确的作者或修改人雷同。')
    );
  } else {
    warnings.forEach((warning) => {
      refs.metadataWarnings.appendChild(
        createElement('div', 'info-pill', `${warning.message}: ${warning.valueA || '-'} / ${warning.valueB || '-'}`)
      );
    });
  }

  if (!(state.docs.A && state.docs.B)) {
    return;
  }

  const fields = [
    ['fileName', '文件名'],
    ['fileSize', '文件大小'],
    ['pageCount', '页数'],
    ['author', '作者'],
    ['company', '所属公司'],
    ['creator', '创建程序'],
    ['lastModifiedBy', '最后修改人'],
    ['createdAt', '创建时间'],
    ['modifiedAt', '修改时间']
  ];

  fields.forEach(([key, label]) => {
    const row = document.createElement('tr');
    const labelCell = createElement('td', null, label);
    let valueA = state.docs.A.parsed.metadata[key] || '-';
    let valueB = state.docs.B.parsed.metadata[key] || '-';

    if (key === 'fileSize') {
      valueA = formatFileSize(valueA);
      valueB = formatFileSize(valueB);
    }

    const valueCellA = createElement('td', null, valueA);
    const valueCellB = createElement('td', null, valueB);
    row.append(labelCell, valueCellA, valueCellB);
    refs.metadataTable.appendChild(row);
  });
}

function renderMetadataMode(selectedItem) {
  renderMetadataTable();

  refs.viewerTitleA.textContent = state.docs.A.file.name;
  refs.viewerTitleB.textContent = state.docs.B.file.name;
  refs.viewerPageA.textContent = '元数据';
  refs.viewerPageB.textContent = '元数据';
  refs.viewerMetaA.textContent = '文件属性';
  refs.viewerMetaB.textContent = selectedItem ? selectedItem.message : '文件属性';

  const leftBlocks = [
    {
      title: '标书 A',
      text: [
        `作者: ${state.docs.A.parsed.metadata.author}`,
        `创建者: ${state.docs.A.parsed.metadata.creator}`,
        `最后修改人: ${state.docs.A.parsed.metadata.lastModifiedBy}`,
        `修改时间: ${state.docs.A.parsed.metadata.modifiedAt || '-'}`
      ].join('\n'),
      highlight: Boolean(selectedItem)
    }
  ];

  const rightBlocks = [
    {
      title: '标书 B',
      text: [
        `作者: ${state.docs.B.parsed.metadata.author}`,
        `创建者: ${state.docs.B.parsed.metadata.creator}`,
        `最后修改人: ${state.docs.B.parsed.metadata.lastModifiedBy}`,
        `修改时间: ${state.docs.B.parsed.metadata.modifiedAt || '-'}`
      ].join('\n'),
      highlight: Boolean(selectedItem)
    }
  ];

  fillViewer(refs.viewerBodyA, leftBlocks);
  fillViewer(refs.viewerBodyB, rightBlocks);
}

function findParagraphByKeyword(doc, keyword) {
  return (doc.parsed.paragraphs || []).find((paragraph) => paragraph.text.includes(keyword)) || null;
}

function renderKeywordMode(selectedItem) {
  refs.keywordList.replaceChildren();

  const keywords = state.compareResult ? state.compareResult.keywordMatches : [];
  if (!keywords.length) {
    refs.keywordList.appendChild(
      createElement('div', 'info-pill', '当前未提取到稳定的共同关键字。')
    );
  } else {
    keywords.forEach((keyword) => {
      const card = createElement('div', 'keyword-card');
      card.appendChild(createElement('strong', null, keyword.keyword));
      card.appendChild(
        createElement('span', null, `标书 A: ${keyword.countA} 次 · 标书 B: ${keyword.countB} 次`)
      );
      refs.keywordList.appendChild(card);
    });
  }

  refs.viewerTitleA.textContent = state.docs.A.file.name;
  refs.viewerTitleB.textContent = state.docs.B.file.name;

  if (!selectedItem) {
    refs.viewerPageA.textContent = '未命中';
    refs.viewerPageB.textContent = '未命中';
    refs.viewerMetaA.textContent = '暂无关键字定位';
    refs.viewerMetaB.textContent = '暂无关键字定位';
    fillViewer(refs.viewerBodyA, []);
    fillViewer(refs.viewerBodyB, []);
    return;
  }

  const paragraphA = findParagraphByKeyword(state.docs.A, selectedItem.keyword);
  const paragraphB = findParagraphByKeyword(state.docs.B, selectedItem.keyword);

  refs.viewerPageA.textContent = paragraphA ? `P${paragraphA.page}` : '未命中';
  refs.viewerPageB.textContent = paragraphB ? `P${paragraphB.page}` : '未命中';
  refs.viewerMetaA.textContent = `关键字: ${selectedItem.keyword}`;
  refs.viewerMetaB.textContent = `重合次数: ${selectedItem.score}`;

  fillViewer(refs.viewerBodyA, paragraphA ? [{
    title: `${selectedItem.keyword} · 标书 A`,
    text: paragraphA.text,
    highlight: true
  }] : []);

  fillViewer(refs.viewerBodyB, paragraphB ? [{
    title: `${selectedItem.keyword} · 标书 B`,
    text: paragraphB.text,
    highlight: true
  }] : []);
}

function renderImageMode() {
  refs.viewerTitleA.textContent = state.docs.A.file.name;
  refs.viewerTitleB.textContent = state.docs.B.file.name;
  refs.viewerPageA.textContent = '待上线';
  refs.viewerPageB.textContent = '待上线';
  refs.viewerMetaA.textContent = '图片对比能力预留';
  refs.viewerMetaB.textContent = '后续可接入图块识别';
  fillViewer(refs.viewerBodyA, []);
  fillViewer(refs.viewerBodyB, []);
}

function renderOverview() {
  if (!state.compareResult) {
    refs.overviewPanel.classList.add('hidden');
    return;
  }

  const overview = state.compareResult.overview;
  refs.overviewPanel.classList.remove('hidden');
  refs.overallScore.textContent = `${overview.overallScore}%`;
  refs.exactScore.textContent = `${overview.exactMatchScore}%`;
  refs.fuzzyScore.textContent = `${overview.fuzzyMatchScore}%`;
  refs.anomalyCount.textContent = String(overview.anomalyCount);
  refs.riskLevel.textContent = riskLabel(overview.riskLevel);
}

function renderWorkbench() {
  if (!(state.docs.A && state.docs.B && state.compareResult)) {
    refs.workbench.classList.add('hidden');
    return;
  }

  refs.workbench.classList.remove('hidden');

  const textCount = state.compareResult.overview.modeCounts.text;
  refs.docChipA.textContent = `${state.docs.A.file.name}（${textCount} 个文本异常）`;
  refs.docChipB.textContent = `${state.docs.B.file.name}（${textCount} 个文本异常）`;

  setActiveDocChip();
  setActiveTab();

  const items = getModeItems();
  const selectedItem = getSelectedItem(items);

  renderSidebar(items);

  if (state.mode === 'text') {
    renderTextMode(selectedItem);
  } else if (state.mode === 'metadata') {
    renderMetadataMode(selectedItem);
  } else if (state.mode === 'keyword') {
    renderKeywordMode(selectedItem);
  } else {
    renderImageMode();
  }
}

async function compareDocuments() {
  if (!(state.docs.A && state.docs.B)) {
    return;
  }

  hideNotice();
  refs.compareBtn.disabled = true;
  refs.compareBtn.textContent = '分析中...';

  try {
    const result = await window.electronAPI.compareDocuments(
      state.docs.A.parsed,
      state.docs.B.parsed
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    state.compareResult = result.result;
    state.mode = 'text';
    state.selectedIndex = {
      text: 0,
      image: 0,
      metadata: 0,
      keyword: 0
    };

    renderOverview();
    renderWorkbench();
    refs.exportBtn.disabled = false;
  } catch (error) {
    showNotice(`比较失败：${error.message}`, {
      type: 'error',
      title: '查重分析失败'
    });
  } finally {
    refs.compareBtn.textContent = '开始查重分析';
    updateCompareButton();
  }
}

function resetAll() {
  hideNotice();
  state.docs.A = null;
  state.docs.B = null;
  state.compareResult = null;
  state.mode = 'text';
  state.sort = 'page';
  state.activeDoc = 'A';
  state.selectedIndex = {
    text: 0,
    image: 0,
    metadata: 0,
    keyword: 0
  };

  ['A', 'B'].forEach((side) => {
    $(`fileName${side}`).textContent = '未选择文件';
    $(`fileMeta${side}`).textContent = '支持 DOCX / PDF / TXT';
    $(`meta${side}`).textContent = '';
    setStatus(side, '');
  });

  refs.sortSelect.value = 'page';
  refs.overviewPanel.classList.add('hidden');
  refs.workbench.classList.add('hidden');
  refs.exportBtn.disabled = true;
  updateCompareButton();
}

async function exportReport() {
  if (!state.compareResult || !state.docs.A || !state.docs.B) {
    return;
  }

  refs.exportBtn.disabled = true;
  refs.exportBtn.textContent = '导出中...';

  try {
    const result = await window.electronAPI.exportReport({
      result: state.compareResult,
      docAName: state.docs.A.file.name,
      docBName: state.docs.B.file.name
    });

    if (result.canceled) {
      // 用户取消
    } else if (result.success) {
      showNotice(`报告已导出: ${result.filePath}`, { type: 'success', title: '导出成功' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showNotice(`导出失败: ${error.message}`, { type: 'error', title: '导出失败' });
  } finally {
    refs.exportBtn.textContent = '导出报告';
    refs.exportBtn.disabled = !state.compareResult;
  }
}

function bindEvents() {
  $('pickFileA').addEventListener('click', () => loadFile('A'));
  $('pickFileB').addEventListener('click', () => loadFile('B'));
  refs.compareBtn.addEventListener('click', compareDocuments);
  refs.exportBtn.addEventListener('click', exportReport);
  refs.resetBtn.addEventListener('click', resetAll);

  refs.docChipA.addEventListener('click', () => {
    state.activeDoc = 'A';
    renderWorkbench();
  });
  refs.docChipB.addEventListener('click', () => {
    state.activeDoc = 'B';
    renderWorkbench();
  });

  refs.sortSelect.addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderWorkbench();
  });

  refs.tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      state.selectedIndex[state.mode] = 0;
      renderWorkbench();
    });
  });

  refs.noticeDismiss.addEventListener('click', hideNotice);
}

bindEvents();
updateCompareButton();
