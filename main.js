const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fsSync = require('fs');
const fs = require('fs/promises');

// 招投标领域停用词：这些词在所有标书中都会出现，不应参与相似度计算
const BID_STOPWORDS = new Set([
  // 投标流程通用词
  '投标', '招标', '标书', '报价', '中标', '开标', '评标', '废标',
  '投标人', '招标人', '采购人', '供应商', '代理',
  '投标文件', '招标文件', '采购文件', '响应文件', '技术方案',
  '技术响应', '商务响应', '投标报价', '投标保证金',
  // 合同/法律通用词
  '合同', '协议', '条款', '违约', '甲方', '乙方', '双方',
  '合同金额', '合同期限', '履约保证',
  // 项目管理通用词
  '项目', '方案', '实施', '验收', '交付', '工期', '进度',
  '项目经理', '项目管理', '实施方案', '售后服务',
  '质量保证', '质量管理', '安全管理',
  // 资质/要求通用词
  '资质', '要求', '条件', '标准', '规范', '满足', '符合',
  '营业执照', '资质证书', '业绩证明',
  // 技术通用词
  '技术', '系统', '平台', '功能', '模块', '接口', '数据',
  '服务器', '网络', '安全', '部署', '运维', '备份',
  '数据库', '软件', '硬件', '设备',
  // 文档结构词
  '附件', '附表', '目录', '说明', '概述', '总结', '清单',
  '第一章', '第二章', '第三章', '第四章', '第五章',
  // 动作通用词
  '提供', '保证', '确保', '支持', '包括', '根据', '按照',
  '负责', '承担', '配合', '完成', '需要', '应当',
  // 量词/连接词
  '以上', '以下', '其中', '以及', '或者', '并且', '同时',
  '本项目', '本次', '本公司', '我方', '贵方',
  // 英文常见词
  'the', 'and', 'for', 'this', 'that', 'with', 'from', 'are', 'was',
  'will', 'shall', 'may', 'can', 'not', 'all', 'any', 'has', 'have',
  'been', 'would', 'should', 'could', 'which', 'their', 'these',
  'project', 'system', 'service', 'management', 'technical',
]);

let mainWindow;

function createWindow() {
  const windowOptions = {
    width: 1540,
    height: 980,
    minWidth: 1280,
    minHeight: 820,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: '标书查重工具'
  };

  const iconPath = path.join(__dirname, 'icon.ico');
  if (fsSync.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\u3000/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeForCompare(text) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[，。！？；：、“”‘’（）【】《》〈〉「」『』,.!?;:[\]{}()"'`~@#$%^&*_+=|\\/<>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isStopword(term) {
  return BID_STOPWORDS.has(term);
}

function tokenizeText(text) {
  const normalized = normalizeForCompare(text);
  if (!normalized) {
    return [];
  }

  const tokens = new Set();
  const latinWords = normalized.match(/[a-z0-9]{2,}/g) || [];
  for (const word of latinWords) {
    if (!isStopword(word)) {
      tokens.add(word);
    }
  }

  const chineseSegments = normalized.match(/[\u4e00-\u9fa5]+/g) || [];
  for (const segment of chineseSegments) {
    if (segment.length <= 2) {
      if (!isStopword(segment)) {
        tokens.add(segment);
      }
      continue;
    }

    // 3-gram: "项目实施方案" → ["项目实", "目实施", "实施方", "施方案"]
    for (let index = 0; index <= segment.length - 3; index += 1) {
      const gram = segment.slice(index, index + 3);
      tokens.add(gram);
    }
  }

  return [...tokens];
}

function computeJaccard(tokensA, tokensB) {
  if (!tokensA.size && !tokensB.size) {
    return 0;
  }

  let intersectionCount = 0;
  const [smaller, larger] = tokensA.size <= tokensB.size ? [tokensA, tokensB] : [tokensB, tokensA];
  for (const token of smaller) {
    if (larger.has(token)) {
      intersectionCount += 1;
    }
  }

  const unionCount = tokensA.size + tokensB.size - intersectionCount;
  return unionCount > 0 ? intersectionCount / unionCount : 0;
}

function buildParagraphEntries(text, fileType) {
  const rawLines = normalizeWhitespace(text)
    .split(/\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  // 合并短行：把连续的短行合并成有意义的段落块（至少 40 个中文字符）
  const MIN_BLOCK_LENGTH = 40;
  const merged = [];
  let buffer = '';

  for (const line of rawLines) {
    buffer = buffer ? `${buffer} ${line}` : line;
    if (buffer.length >= MIN_BLOCK_LENGTH) {
      merged.push(buffer);
      buffer = '';
    }
  }
  if (buffer) {
    // 尾部剩余：如果太短就合并到最后一个块
    if (merged.length > 0 && buffer.length < MIN_BLOCK_LENGTH) {
      merged[merged.length - 1] += ` ${buffer}`;
    } else {
      merged.push(buffer);
    }
  }

  const estimatedPageSize = fileType === 'txt' ? 8 : 5;

  return merged.map((paragraphText, index) => ({
    id: `p-${index + 1}`,
    order: index,
    page: Math.floor(index / estimatedPageSize) + 1,
    text: paragraphText
  }));
}

function estimateSeverity(score) {
  if (score >= 0.9) {
    return 'high';
  }
  if (score >= 0.75) {
    return 'medium';
  }
  return 'low';
}

function getRiskLevel({ overallScore, textAnomalyCount, metadataCount, keywordCount }) {
  if (overallScore >= 85 || textAnomalyCount >= 8 || metadataCount >= 2) {
    return 'high';
  }
  if (overallScore >= 60 || textAnomalyCount >= 3 || metadataCount >= 1 || keywordCount >= 8) {
    return 'medium';
  }
  return 'low';
}

function isKnownMetadata(value) {
  return Boolean(value) && value !== '未知';
}

function areDatesClose(dateA, dateB, maxHours) {
  if (!dateA || !dateB) {
    return false;
  }

  const first = Date.parse(dateA);
  const second = Date.parse(dateB);
  if (Number.isNaN(first) || Number.isNaN(second)) {
    return false;
  }

  const diffHours = Math.abs(first - second) / (1000 * 60 * 60);
  return diffHours <= maxHours;
}

function truncateText(text, maxLength = 160) {
  if (!text) {
    return '';
  }

  const compact = normalizeWhitespace(text);
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength)}...`;
}

// 提取两段文本中完全相同的子串（用于精准高亮）
function extractExactMatches(textA, textB) {
  const DiffMatchPatch = require('diff-match-patch').diff_match_patch;
  const dmp = new DiffMatchPatch();

  const diff = dmp.diff_main(textA, textB);
  dmp.diff_cleanupSemantic(diff);

  const matches = [];
  let posA = 0;
  let posB = 0;

  for (const [operation, data] of diff) {
    const length = data.length;
    if (operation === 0 && length >= 8) {
      // 完全相同且长度>=8字符才记录
      matches.push({
        textA: data,
        textB: data,
        startA: posA,
        startB: posB,
        length
      });
    }
    if (operation !== -1) {
      posA += length;
    }
    if (operation !== 1) {
      posB += length;
    }
  }

  return matches;
}

function buildTextProfiles(paragraphs) {
  return (paragraphs || [])
    .filter((paragraph) => paragraph && paragraph.text && paragraph.text.trim().length >= 30)
    .map((paragraph) => {
      const tokens = new Set(tokenizeText(paragraph.text));
      return {
        ...paragraph,
        normalized: normalizeForCompare(paragraph.text),
        tokens
      };
    })
    .filter((profile) => profile.tokens.size >= 3);
}

function buildKeywordCandidates(text) {
  const normalized = normalizeForCompare(text);
  const candidates = new Map();

  const words = normalized.match(/[a-z0-9]{3,}/g) || [];
  for (const word of words) {
    if (!isStopword(word)) {
      candidates.set(word, (candidates.get(word) || 0) + 1);
    }
  }

  const chineseSegments = normalized.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  for (const segment of chineseSegments) {
    if (isStopword(segment)) {
      continue;
    }

    if (segment.length <= 4) {
      candidates.set(segment, (candidates.get(segment) || 0) + 1);
      continue;
    }

    for (let index = 0; index <= segment.length - 4; index += 1) {
      const gram = segment.slice(index, index + 4);
      candidates.set(gram, (candidates.get(gram) || 0) + 1);
    }
  }

  return candidates;
}

function buildSharedKeywords(textA, textB) {
  const keywordsA = buildKeywordCandidates(textA);
  const keywordsB = buildKeywordCandidates(textB);
  const shared = [];

  for (const [keyword, countA] of keywordsA.entries()) {
    if (!keywordsB.has(keyword)) {
      continue;
    }

    const weight = Math.min(countA, keywordsB.get(keyword));
    if (weight < 2 || keyword.length < 3) {
      continue;
    }

    shared.push({
      keyword,
      countA,
      countB: keywordsB.get(keyword),
      score: weight
    });
  }

  return shared
    .sort((left, right) => right.score - left.score || right.keyword.length - left.keyword.length)
    .slice(0, 12);
}

function buildMetadataWarnings(docA, docB) {
  const warnings = [];
  const metaA = docA.metadata || {};
  const metaB = docB.metadata || {};

  if (isKnownMetadata(metaA.author) && isKnownMetadata(metaB.author) && metaA.author === metaB.author) {
    warnings.push({
      id: 'meta-author',
      type: 'author',
      severity: 'medium',
      message: '两份文档作者相同',
      valueA: metaA.author,
      valueB: metaB.author
    });
  }

  if (isKnownMetadata(metaA.creator) && isKnownMetadata(metaB.creator) && metaA.creator === metaB.creator) {
    warnings.push({
      id: 'meta-creator',
      type: 'creator',
      severity: 'medium',
      message: '两份文档创建程序相同',
      valueA: metaA.creator,
      valueB: metaB.creator
    });
  }

  if (
    isKnownMetadata(metaA.lastModifiedBy) &&
    isKnownMetadata(metaB.lastModifiedBy) &&
    metaA.lastModifiedBy === metaB.lastModifiedBy
  ) {
    warnings.push({
      id: 'meta-last-modified-by',
      type: 'lastModifiedBy',
      severity: 'medium',
      message: '两份文档最后修改人相同',
      valueA: metaA.lastModifiedBy,
      valueB: metaB.lastModifiedBy
    });
  }

  if (areDatesClose(metaA.modifiedAt, metaB.modifiedAt, 24)) {
    warnings.push({
      id: 'meta-modified-at',
      type: 'modifiedAt',
      severity: 'low',
      message: '两份文档修改时间接近（24 小时内）',
      valueA: metaA.modifiedAt,
      valueB: metaB.modifiedAt
    });
  }

  if (isKnownMetadata(metaA.company) && isKnownMetadata(metaB.company) && metaA.company === metaB.company) {
    warnings.push({
      id: 'meta-company',
      type: 'company',
      severity: 'high',
      message: '两份文档所属公司相同',
      valueA: metaA.company,
      valueB: metaB.company
    });
  }

  return warnings;
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('dialog:openFile', async () => dialog.showOpenDialog(mainWindow, {
  properties: ['openFile'],
  filters: [
    { name: 'Documents', extensions: ['docx', 'pdf', 'txt'] }
  ]
}));

ipcMain.handle('file:read', async (event, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);

    return {
      success: true,
      data: buffer,
      name: path.basename(filePath),
      size: stats.size,
      createdAt: stats.birthtime.toISOString(),
      modifiedAt: stats.mtime.toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('document:parse', async (event, {
  buffer,
  fileName,
  fileType,
  createdAt,
  modifiedAt
}) => {
  try {
    const mammoth = require('mammoth');
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

    let text = '';
    let paragraphs = [];
    const metadata = {
      fileName,
      fileSize: buffer.length,
      fileType,
      author: '未知',
      creator: '未知',
      lastModifiedBy: '未知',
      pageCount: 1,
      createdAt,
      modifiedAt
    };

    if (fileType === 'docx') {
      const docxBuffer = Buffer.from(buffer);
      const result = await mammoth.extractRawText({ buffer: docxBuffer });
      text = normalizeWhitespace(result.value);
      paragraphs = buildParagraphEntries(text, fileType);
      metadata.pageCount = Math.max(1, Math.ceil(paragraphs.length / 5));

      // 深度提取 DOCX 元数据：解压 docx 读取 docProps/core.xml
      try {
        const JSZip = require('jszip');
        const zip = await JSZip.loadAsync(docxBuffer);
        const coreXml = await zip.file('docProps/core.xml')?.async('string');
        if (coreXml) {
          const getXmlValue = (xml, tag) => {
            const patterns = [
              new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'),
              new RegExp(`<dc:${tag}>([^<]*)</dc:${tag}>`, 'i'),
              new RegExp(`<cp:${tag}>([^<]*)</cp:${tag}>`, 'i'),
              new RegExp(`<dcterms:${tag}[^>]*>([^<]*)</dcterms:${tag}>`, 'i'),
            ];
            for (const pattern of patterns) {
              const match = xml.match(pattern);
              if (match && match[1].trim()) return match[1].trim();
            }
            return null;
          };
          metadata.author = getXmlValue(coreXml, 'creator') || metadata.author;
          metadata.lastModifiedBy = getXmlValue(coreXml, 'lastModifiedBy') || metadata.lastModifiedBy;
          metadata.createdAt = getXmlValue(coreXml, 'created') || metadata.createdAt;
          metadata.modifiedAt = getXmlValue(coreXml, 'modified') || metadata.modifiedAt;
        }
        const appXml = await zip.file('docProps/app.xml')?.async('string');
        if (appXml) {
          const appMatch = appXml.match(/<Application>([^<]*)<\/Application>/i);
          if (appMatch && appMatch[1].trim()) {
            metadata.creator = appMatch[1].trim();
          }
          const companyMatch = appXml.match(/<Company>([^<]*)<\/Company>/i);
          if (companyMatch && companyMatch[1].trim()) {
            metadata.company = companyMatch[1].trim();
          }
          const pagesMatch = appXml.match(/<Pages>(\d+)<\/Pages>/i);
          if (pagesMatch) {
            metadata.pageCount = parseInt(pagesMatch[1], 10) || metadata.pageCount;
          }
        }
      } catch (zipError) {
        // DOCX 元数据提取失败不影响主流程
      }
    } else if (fileType === 'pdf') {
      const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        disableWorker: true
      }).promise;

      metadata.pageCount = pdf.numPages;

      const pdfMeta = await pdf.getMetadata().catch(() => null);
      if (pdfMeta && pdfMeta.info) {
        metadata.author = pdfMeta.info.Author || metadata.author;
        metadata.creator = pdfMeta.info.Creator || pdfMeta.info.Producer || metadata.creator;
        metadata.lastModifiedBy = pdfMeta.info.ModDate || metadata.lastModifiedBy;
      }

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = normalizeWhitespace(
          textContent.items.map((item) => item.str || '').join(' ')
        );

        if (!pageText) {
          continue;
        }

        paragraphs.push({
          id: `page-${pageNumber}`,
          order: paragraphs.length,
          page: pageNumber,
          text: pageText
        });
      }

      text = paragraphs.map((paragraph) => paragraph.text).join('\n');
    } else {
      text = normalizeWhitespace(Buffer.from(buffer).toString('utf-8'));
      paragraphs = buildParagraphEntries(text, fileType);
      metadata.pageCount = Math.max(1, Math.ceil(paragraphs.length / 25));
    }

    if (!paragraphs.length && text) {
      paragraphs = buildParagraphEntries(text, fileType);
    }

    return {
      success: true,
      text,
      metadata,
      paragraphs
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('documents:compare', async (event, { docA, docB }) => {
  try {
    const DiffMatchPatch = require('diff-match-patch').diff_match_patch;
    const dmp = new DiffMatchPatch();

    const textA = normalizeForCompare(docA.text || '');
    const textB = normalizeForCompare(docB.text || '');

    const overallTokensA = new Set(tokenizeText(textA));
    const overallTokensB = new Set(tokenizeText(textB));
    const tokenScore = computeJaccard(overallTokensA, overallTokensB) * 100;

    const diff = dmp.diff_main(textA, textB);
    dmp.diff_cleanupSemantic(diff);
    const diffLength = diff.reduce((sum, item) => sum + item[1].length, 0);
    const exactMatchScore = diffLength > 0
      ? Math.max(
        0,
        100 - ((diff.filter((item) => item[0] !== 0).reduce((sum, item) => sum + item[1].length, 0) / diffLength) * 100)
      )
      : 100;

    const fuzzyMatchScore = Math.round((tokenScore * 0.65) + (exactMatchScore * 0.35));
    const overallScore = Math.round((tokenScore * 0.55) + (exactMatchScore * 0.45));

    const profilesA = buildTextProfiles(docA.paragraphs);
    const profilesB = buildTextProfiles(docB.paragraphs);
    const tokenIndexB = new Map();

    profilesB.forEach((profile, profileIndex) => {
      profile.tokens.forEach((token) => {
        if (!tokenIndexB.has(token)) {
          tokenIndexB.set(token, new Set());
        }
        tokenIndexB.get(token).add(profileIndex);
      });
    });

    const textAnomalies = [];
    const pairIds = new Set();

    profilesA.forEach((profileA) => {
      const candidateIndices = new Set();
      profileA.tokens.forEach((token) => {
        const matchedProfiles = tokenIndexB.get(token);
        if (!matchedProfiles) {
          return;
        }

        matchedProfiles.forEach((candidateIndex) => {
          if (candidateIndices.size < 80) {
            candidateIndices.add(candidateIndex);
          }
        });
      });

      let bestMatch = null;

      candidateIndices.forEach((candidateIndex) => {
        const profileB = profilesB[candidateIndex];
        const similarity = computeJaccard(profileA.tokens, profileB.tokens);
        if (similarity < 0.65) {
          return;
        }

        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { profileB, similarity };
        }
      });

      if (!bestMatch) {
        return;
      }

      const pairId = `${profileA.id}:${bestMatch.profileB.id}`;
      if (pairIds.has(pairId)) {
        return;
      }
      pairIds.add(pairId);

      const similarityScore = Number(bestMatch.similarity.toFixed(3));
      const severity = estimateSeverity(similarityScore);
      const exactMatches = extractExactMatches(profileA.text, bestMatch.profileB.text);

      textAnomalies.push({
        id: `text-${textAnomalies.length + 1}`,
        type: 'text',
        severity,
        score: similarityScore,
        pageA: profileA.page,
        pageB: bestMatch.profileB.page,
        rectsA: [],
        rectsB: [],
        excerptA: truncateText(profileA.text),
        excerptB: truncateText(bestMatch.profileB.text),
        textA: profileA.text,
        textB: bestMatch.profileB.text,
        exactMatches,
        groupLabel: `异常页${profileA.page}`,
        reason: similarityScore >= 0.9 ? '长段文本高度一致' : '关键短语和语义结构相近',
        matchType: similarityScore >= 0.9 ? 'exact' : 'fuzzy'
      });
    });

    textAnomalies.sort((left, right) => right.score - left.score || left.pageA - right.pageA);

    const metadataWarnings = buildMetadataWarnings(docA, docB);
    const keywordMatches = buildSharedKeywords(docA.text || '', docB.text || '');

    const riskLevel = getRiskLevel({
      overallScore,
      textAnomalyCount: textAnomalies.length,
      metadataCount: metadataWarnings.length,
      keywordCount: keywordMatches.length
    });

    return {
      success: true,
      result: {
        overview: {
          overallScore,
          exactMatchScore: Math.round(exactMatchScore),
          fuzzyMatchScore,
          riskLevel,
          anomalyCount: textAnomalies.length + metadataWarnings.length + keywordMatches.length,
          modeCounts: {
            text: textAnomalies.length,
            image: 0,
            metadata: metadataWarnings.length,
            keyword: keywordMatches.length
          }
        },
        textAnomalies,
        metadataWarnings,
        keywordMatches
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('report:export', async (event, { result, docAName, docBName }) => {
  try {
    const savePath = await dialog.showSaveDialog(mainWindow, {
      title: '导出查重报告',
      defaultPath: `查重报告_${docAName}_vs_${docBName}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    });

    if (savePath.canceled || !savePath.filePath) {
      return { success: false, canceled: true };
    }

    const overview = result.overview;
    const riskColor = overview.riskLevel === 'high' ? '#dc2626' : overview.riskLevel === 'medium' ? '#d97706' : '#15803d';
    const riskText = overview.riskLevel === 'high' ? '高风险' : overview.riskLevel === 'medium' ? '中风险' : '低风险';

    const anomalyRows = result.textAnomalies.map((item, i) => {
      const sevColor = item.severity === 'high' ? '#dc2626' : item.severity === 'medium' ? '#d97706' : '#15803d';
      const sevText = item.severity === 'high' ? '高' : item.severity === 'medium' ? '中' : '低';
      return `<tr>
        <td>${i + 1}</td>
        <td><span style="color:${sevColor};font-weight:700">${sevText}</span></td>
        <td>${Math.round(item.score * 100)}%</td>
        <td>A: P${item.pageA} / B: P${item.pageB}</td>
        <td style="max-width:300px;word-break:break-all;font-size:12px">${escapeHtml(truncateText(item.textA, 100))}</td>
        <td style="max-width:300px;word-break:break-all;font-size:12px">${escapeHtml(truncateText(item.textB, 100))}</td>
      </tr>`;
    }).join('\n');

    const metaRows = result.metadataWarnings.map((w) =>
      `<tr><td>${escapeHtml(w.message)}</td><td>${escapeHtml(w.valueA || '-')}</td><td>${escapeHtml(w.valueB || '-')}</td></tr>`
    ).join('\n');

    const keywordRows = result.keywordMatches.map((k) =>
      `<tr><td>${escapeHtml(k.keyword)}</td><td>${k.countA}</td><td>${k.countB}</td><td>${k.score}</td></tr>`
    ).join('\n');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>查重报告 - ${escapeHtml(docAName)} vs ${escapeHtml(docBName)}</title>
<style>
  body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;margin:0;padding:32px;background:#f8fafc;color:#1f2937}
  .container{max-width:1200px;margin:0 auto}
  h1{font-size:24px;margin:0 0 8px} .subtitle{color:#667085;margin:0 0 24px}
  .cards{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px}
  .card{background:#fff;border:1px solid #d5dbe3;border-radius:10px;padding:16px}
  .card .label{font-size:12px;color:#667085} .card .value{font-size:24px;font-weight:700;margin-top:6px}
  .risk{color:${riskColor}} table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;margin-bottom:24px}
  th,td{padding:10px 14px;border:1px solid #e5e7eb;text-align:left;font-size:13px}
  th{background:#f1f5f9;font-weight:600;color:#667085} h2{font-size:18px;margin:24px 0 12px}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #d5dbe3;color:#667085;font-size:12px}
</style>
</head>
<body>
<div class="container">
  <h1>标书查重报告</h1>
  <p class="subtitle">标书 A: ${escapeHtml(docAName)} &nbsp;|&nbsp; 标书 B: ${escapeHtml(docBName)} &nbsp;|&nbsp; 生成时间: ${new Date().toLocaleString('zh-CN')}</p>
  <div class="cards">
    <div class="card"><div class="label">综合相似度</div><div class="value">${overview.overallScore}%</div></div>
    <div class="card"><div class="label">精确匹配</div><div class="value">${overview.exactMatchScore}%</div></div>
    <div class="card"><div class="label">模糊匹配</div><div class="value">${overview.fuzzyMatchScore}%</div></div>
    <div class="card"><div class="label">异常总数</div><div class="value">${overview.anomalyCount}</div></div>
    <div class="card"><div class="label">风险等级</div><div class="value risk">${riskText}</div></div>
  </div>

  <h2>文本异常 (${result.textAnomalies.length} 项)</h2>
  ${result.textAnomalies.length ? `<table>
    <thead><tr><th>#</th><th>风险</th><th>相似度</th><th>页码</th><th>标书 A 片段</th><th>标书 B 片段</th></tr></thead>
    <tbody>${anomalyRows}</tbody>
  </table>` : '<p style="color:#667085">未发现文本异常。</p>'}

  <h2>元数据警告 (${result.metadataWarnings.length} 项)</h2>
  ${result.metadataWarnings.length ? `<table>
    <thead><tr><th>警告</th><th>标书 A</th><th>标书 B</th></tr></thead>
    <tbody>${metaRows}</tbody>
  </table>` : '<p style="color:#667085">未发现元数据异常。</p>'}

  <h2>关键字重合 (${result.keywordMatches.length} 项)</h2>
  ${result.keywordMatches.length ? `<table>
    <thead><tr><th>关键字</th><th>标书 A 次数</th><th>标书 B 次数</th><th>权重</th></tr></thead>
    <tbody>${keywordRows}</tbody>
  </table>` : '<p style="color:#667085">未发现关键字重合。</p>'}

  <div class="footer">报告由「标书查重工具」自动生成</div>
</div>
</body>
</html>`;

    await fs.writeFile(savePath.filePath, html, 'utf-8');
    return { success: true, filePath: savePath.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

console.log('标书查重工具后端已启动');
