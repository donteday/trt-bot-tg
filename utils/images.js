const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// 🎴 Случайная выборка трёх карт из колоды
function drawCards(tarotDeck) {
  const selected = [];
  while (selected.length < 3) {
    const rand = tarotDeck[Math.floor(Math.random() * tarotDeck.length)];
    if (!selected.includes(rand)) selected.push(rand);
  }
  return selected;
}

// 🖼️ Склейка трёх карт в одно изображение
async function generateMergedImage(cardsIds, userId) {
  const images = await Promise.all(
    cardsIds.map((id) =>
      sharp(path.join(__dirname, "..", "img", `${id}.jpg`))
        .resize(400, 700)
        .toBuffer()
    )
  );

  const width = 400 * images.length;
  const height = 700;

  const { data } = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(images.map((img, i) => ({ input: img, left: i * 400, top: 0 })))
    .jpeg()
    .toBuffer({ resolveWithObject: true });

  const filename = `merged-${userId}-${Date.now()}.jpg`;
  const outputPath = path.join(__dirname, "..", filename);

  fs.writeFileSync(outputPath, data);
  return outputPath;
}

async function generateBonusImage(cardIds, userId) {
  try {
    const cardWidth = 500;
    const cardHeight = 800;

    // Загружаем и ресайзим все карты
    const cardImages = await Promise.all(
      cardIds.map(async (id) =>
        sharp(path.join(__dirname, "..", "img", `${id}.jpg`))
          .resize(cardWidth, cardHeight)
          .toBuffer()
      )
    );

    const totalWidth = cardWidth * cardIds.length;
    const totalHeight = cardHeight;

    const { data } = await sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite(
        cardImages.map((img, i) => ({
          input: img,
          left: i * cardWidth,
          top: 0,
        }))
      )
      .jpeg()
      .toBuffer({ resolveWithObject: true });

    const filename = `bonus-${userId}-${Date.now()}.jpg`;
    const outputPath = path.join(__dirname, "..", filename);
    fs.writeFileSync(outputPath, data);

    return outputPath;
  } catch (error) {
    console.error("❌ Ошибка при генерации бонусного изображения:", error);
    throw error;
  }
}


// 🧹 Удаляет "осиротевшие" merged-/bonus- файлы (например, после таймаутов
// или падения процесса), которые не были удалены обработчиками.
function cleanupOrphanedImages(maxAgeMs = 10 * 60 * 1000) {
  const dir = path.join(__dirname, "..");
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (err) {
    console.error("❌ Ошибка чтения директории для очистки временных изображений:", err);
    return;
  }

  const now = Date.now();
  for (const file of files) {
    if (!/^(merged|bonus)-.+\.jpg$/.test(file)) continue;

    const filePath = path.join(dir, file);
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log("🧹 Удалён осиротевший файл изображения:", file);
      }
    } catch (err) {
      // Файл мог быть удалён параллельно — игнорируем
    }
  }
}

module.exports = { drawCards, generateMergedImage, generateBonusImage, cleanupOrphanedImages };
