import pptxgen from "pptxgenjs";

const COLORS = {
  ink: "111827",
  paper: "F6F7F4",
  white: "FFFFFF",
  muted: "667085",
  line: "DDE3EA",
  blue: "1F4E8C",
  teal: "0F766E",
  amber: "D97706",
  green: "15803D",
  red: "B42318"
};

const ACCENTS = [COLORS.blue, COLORS.teal, COLORS.amber, "7C3AED", COLORS.green];
const FONT = "Tahoma";
const SHAPE = {
  rect: "rect",
  roundRect: "roundRect",
  ellipse: "ellipse",
  line: "line"
};

function cleanText(value = "", maxLength = 180) {
  return String(value)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanItems(items = [], maxItems = 5, maxLength = 120) {
  const source = Array.isArray(items) ? items : String(items || "").split("\n");
  return source.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function normalizeChartData(chartData = {}) {
  const categories = Array.isArray(chartData.categories) ? chartData.categories.map((item) => cleanText(item, 28)) : [];
  const series = Array.isArray(chartData.series) ? chartData.series : [];
  return {
    title: cleanText(chartData.title || "Trend", 80),
    categories,
    series: series
      .map((item, index) => ({
        name: cleanText(item.name || `Series ${index + 1}`, 32),
        values: Array.isArray(item.values) ? item.values.map((value) => Number(value) || 0) : [],
        color: ACCENTS[index % ACCENTS.length]
      }))
      .filter((item) => item.values.length)
  };
}

function inferLayout(slide = {}, index = 0) {
  if (Array.isArray(slide.metrics) && slide.metrics.length) return "kpi";
  if (slide.chartData?.categories?.length && slide.chartData?.series?.length) return "chart";
  if (index >= 2 || /action|plan|next|todo|recommend|แผน|ขั้นตอน/i.test(`${slide.title || ""} ${slide.body || ""}`)) return "action";
  return "insight";
}

function addFooter(slide, pageNumber) {
  slide.addShape(SHAPE.line, {
    x: 0.6,
    y: 7.05,
    w: 12.1,
    h: 0,
    line: { color: COLORS.line, transparency: 10 }
  });
  slide.addText(`CEO Partner  |  ${String(pageNumber).padStart(2, "0")}`, {
    x: 0.65,
    y: 7.12,
    w: 4,
    h: 0.18,
    fontFace: FONT,
    fontSize: 7,
    color: COLORS.muted,
    margin: 0
  });
}

function addTitle(slide, { kicker, title }, pageNumber) {
  slide.addText(cleanText(kicker || "EXECUTIVE VIEW", 32).toUpperCase(), {
    x: 0.68,
    y: 0.42,
    w: 2.4,
    h: 0.22,
    fontFace: FONT,
    fontSize: 7.5,
    bold: true,
    color: COLORS.teal,
    margin: 0
  });
  slide.addText(cleanText(title || `Slide ${pageNumber}`, 96), {
    x: 0.65,
    y: 0.78,
    w: 11.2,
    h: 0.82,
    fontFace: FONT,
    fontSize: 23,
    bold: true,
    color: COLORS.ink,
    margin: 0.02,
    fit: "shrink"
  });
}

function addCover(pptx, { title, subtitle }) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.ink };
  slide.addShape(SHAPE.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: COLORS.ink }, line: { transparency: 100 } });
  slide.addShape(SHAPE.rect, { x: 0.72, y: 1.3, w: 0.12, h: 3.2, fill: { color: COLORS.amber }, line: { transparency: 100 } });
  slide.addText(cleanText(title, 100), {
    x: 1.08,
    y: 1.58,
    w: 10.6,
    h: 1.25,
    fontFace: FONT,
    fontSize: 34,
    bold: true,
    color: COLORS.white,
    margin: 0,
    fit: "shrink"
  });
  if (subtitle) {
    slide.addText(cleanText(subtitle, 160), {
      x: 1.1,
      y: 3.08,
      w: 8.9,
      h: 0.78,
      fontFace: FONT,
      fontSize: 15,
      color: "D8DEE7",
      breakLine: false,
      fit: "shrink",
      margin: 0
    });
  }
  slide.addText("CEO Partner", {
    x: 1.1,
    y: 6.78,
    w: 2,
    h: 0.22,
    fontFace: FONT,
    fontSize: 8,
    bold: true,
    color: "D8DEE7",
    margin: 0
  });
}

function addKpiSlide(pptx, slideData, pageNumber) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.paper };
  addTitle(slide, slideData, pageNumber);
  const metrics = (slideData.metrics || []).slice(0, 4);
  metrics.forEach((metric, index) => {
    const x = 0.65 + index * 3.05;
    slide.addShape(SHAPE.roundRect, {
      x,
      y: 2.15,
      w: 2.65,
      h: 1.55,
      rectRadius: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.line, transparency: 0 }
    });
    slide.addShape(SHAPE.rect, {
      x,
      y: 2.15,
      w: 0.08,
      h: 1.55,
      fill: { color: ACCENTS[index % ACCENTS.length] },
      line: { transparency: 100 }
    });
    slide.addText(cleanText(metric.value || metric.metric || "", 20), {
      x: x + 0.22,
      y: 2.43,
      w: 2.15,
      h: 0.42,
      fontFace: FONT,
      fontSize: 22,
      bold: true,
      color: ACCENTS[index % ACCENTS.length],
      margin: 0,
      fit: "shrink"
    });
    slide.addText(cleanText(metric.label || metric.name || "", 46), {
      x: x + 0.22,
      y: 3.03,
      w: 2.05,
      h: 0.36,
      fontFace: FONT,
      fontSize: 9.5,
      color: COLORS.muted,
      margin: 0,
      fit: "shrink"
    });
  });
  addInsightPanel(slide, slideData, 0.65, 4.38, 12.0, 1.3);
  addFooter(slide, pageNumber);
}

function addInsightPanel(slide, slideData, x, y, w, h) {
  const items = cleanItems(slideData.bullets || slideData.body, 4, 94);
  slide.addShape(SHAPE.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: COLORS.ink },
    line: { transparency: 100 }
  });
  slide.addText("Key moves", {
    x: x + 0.24,
    y: y + 0.18,
    w: 1.4,
    h: 0.24,
    fontFace: FONT,
    fontSize: 10.5,
    bold: true,
    color: COLORS.white,
    margin: 0
  });
  items.forEach((item, index) => {
    slide.addText(`${index + 1}. ${item}`, {
      x: x + 0.24 + (index % 2) * 5.8,
      y: y + 0.56 + Math.floor(index / 2) * 0.38,
      w: 5.35,
      h: 0.28,
      fontFace: FONT,
      fontSize: 8.4,
      color: "EDF2F7",
      margin: 0,
      fit: "shrink"
    });
  });
}

function addChartSlide(pptx, slideData, pageNumber) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.paper };
  addTitle(slide, slideData, pageNumber);
  const chart = normalizeChartData(slideData.chartData);
  const values = chart.series[0]?.values || [];
  const max = Math.max(...values, 1);
  slide.addText(chart.title, {
    x: 0.78,
    y: 1.9,
    w: 5.6,
    h: 0.28,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    color: COLORS.ink,
    margin: 0
  });
  values.slice(0, 6).forEach((value, index) => {
    const y = 2.38 + index * 0.52;
    const barW = Math.max(0.2, (value / max) * 4.55);
    slide.addText(chart.categories[index] || `Item ${index + 1}`, {
      x: 0.78,
      y,
      w: 2.0,
      h: 0.24,
      fontFace: FONT,
      fontSize: 8.2,
      color: COLORS.muted,
      margin: 0,
      fit: "shrink"
    });
    slide.addShape(SHAPE.roundRect, {
      x: 2.92,
      y: y + 0.02,
      w: barW,
      h: 0.22,
      rectRadius: 0.06,
      fill: { color: chart.series[0].color },
      line: { transparency: 100 }
    });
    slide.addText(String(value), {
      x: 3.04 + barW,
      y: y - 0.01,
      w: 0.75,
      h: 0.22,
      fontFace: FONT,
      fontSize: 8.5,
      bold: true,
      color: COLORS.ink,
      margin: 0
    });
  });
  addSideRail(slide, slideData);
  addFooter(slide, pageNumber);
}

function addSideRail(slide, slideData) {
  const items = cleanItems(slideData.bullets || slideData.body, 4, 78);
  slide.addShape(SHAPE.roundRect, {
    x: 9.0,
    y: 1.82,
    w: 3.45,
    h: 4.45,
    rectRadius: 0.08,
    fill: { color: COLORS.ink },
    line: { transparency: 100 }
  });
  slide.addText("Decision notes", {
    x: 9.28,
    y: 2.12,
    w: 2.3,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: COLORS.white,
    margin: 0
  });
  items.forEach((item, index) => {
    slide.addShape(SHAPE.ellipse, {
      x: 9.27,
      y: 2.72 + index * 0.72,
      w: 0.14,
      h: 0.14,
      fill: { color: ACCENTS[index % ACCENTS.length] },
      line: { transparency: 100 }
    });
    slide.addText(item, {
      x: 9.55,
      y: 2.62 + index * 0.72,
      w: 2.45,
      h: 0.44,
      fontFace: FONT,
      fontSize: 8.5,
      color: "F3F6FA",
      margin: 0,
      fit: "shrink"
    });
  });
}

function addActionSlide(pptx, slideData, pageNumber) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.paper };
  addTitle(slide, slideData, pageNumber);
  const items = cleanItems(slideData.bullets || slideData.body, 5, 105);
  items.forEach((item, index) => {
    const y = 1.88 + index * 0.82;
    slide.addShape(SHAPE.roundRect, {
      x: 1.0,
      y,
      w: 10.95,
      h: 0.55,
      rectRadius: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.line }
    });
    slide.addShape(SHAPE.ellipse, {
      x: 1.28,
      y: y + 0.14,
      w: 0.26,
      h: 0.26,
      fill: { color: ACCENTS[index % ACCENTS.length] },
      line: { transparency: 100 }
    });
    slide.addText(String(index + 1), {
      x: 1.34,
      y: y + 0.17,
      w: 0.12,
      h: 0.12,
      fontFace: FONT,
      fontSize: 6.5,
      bold: true,
      color: COLORS.white,
      margin: 0
    });
    slide.addText(item, {
      x: 1.78,
      y: y + 0.15,
      w: 9.55,
      h: 0.24,
      fontFace: FONT,
      fontSize: 10.5,
      color: COLORS.ink,
      margin: 0,
      fit: "shrink"
    });
  });
  addFooter(slide, pageNumber);
}

function addInsightSlide(pptx, slideData, pageNumber) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.paper };
  addTitle(slide, slideData, pageNumber);
  const items = cleanItems(slideData.bullets || slideData.body, 4, 95);
  items.forEach((item, index) => {
    const x = 0.82 + (index % 2) * 5.85;
    const y = 2.0 + Math.floor(index / 2) * 1.62;
    slide.addShape(SHAPE.roundRect, {
      x,
      y,
      w: 5.15,
      h: 1.06,
      rectRadius: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.line }
    });
    slide.addText(cleanText(item, 96), {
      x: x + 0.24,
      y: y + 0.24,
      w: 4.65,
      h: 0.5,
      fontFace: FONT,
      fontSize: 10,
      color: COLORS.ink,
      margin: 0,
      fit: "shrink"
    });
  });
  addFooter(slide, pageNumber);
}

export async function createGraphicDeckBuffer({ title, subtitle = "", slides = [] }) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "CEO Partner";
  pptx.subject = "CEO Partner executive report";
  pptx.title = cleanText(title, 120);
  pptx.company = "CEO Partner";
  pptx.lang = "th-TH";
  pptx.theme = {
    headFontFace: FONT,
    bodyFontFace: FONT,
    lang: "th-TH"
  };

  addCover(pptx, { title, subtitle });
  slides.slice(0, 10).forEach((slideData, index) => {
    const pageNumber = index + 2;
    const layout = slideData.layout || inferLayout(slideData, index);
    if (layout === "kpi") addKpiSlide(pptx, slideData, pageNumber);
    else if (layout === "chart") addChartSlide(pptx, slideData, pageNumber);
    else if (layout === "action") addActionSlide(pptx, slideData, pageNumber);
    else addInsightSlide(pptx, slideData, pageNumber);
  });

  return pptx.write({ outputType: "nodebuffer" });
}
