// Node.js скрипт: ввод даты рождения в терминал -> генерация детализированного PDF (А4) с "матрицей судьбы"
// matrix_full.js
// Требования: npm install pdfkit
// Положи в папку fonts/ шрифты DejaVuSans.ttf и DejaVuSans-Bold.ttf (или другой кириллический TTF).

const fs = require('fs');
const PDFDocument = require('pdfkit');
const readline = require('readline');
const path = require('path');

const FONT_REGULAR = 'fonts/arialmt.ttf';
const FONT_BOLD = 'fonts/arialmt.ttf';
console.log(FONT_REGULAR);


// --- Вспомогательные функции ---
function parseDateInput(input) {
    // Поддерживаем форматы: dd.mm.yyyy, dd-mm-yyyy, yyyy-mm-dd, dd mm yyyy
    const s = input.trim().replace(/[\/\\]/g, '.').replace(/-/g, '.').replace(/\s+/g, '.');
    const parts = s.split('.').filter(Boolean);
    if (parts.length === 3) {
        // Определим порядок: если первая часть >= 1000 -> yyyy.mm.dd
        if (parts[0].length === 4) {
            const yyyy = parts[0];
            const mm = parts[1];
            const dd = parts[2];
            return normalizeDateParts(dd, mm, yyyy);
        } else {
            const dd = parts[0];
            const mm = parts[1];
            const yyyy = parts[2].length === 2 ? expandTwoDigitYear(parts[2]) : parts[2];
            return normalizeDateParts(dd, mm, yyyy);
        }
    }
    return null;
}

function expandTwoDigitYear(y2) {
    const y = parseInt(y2, 10);
    // Простая логика: если > 30 -> 19xx, иначе 20xx
    return (y > 30 ? 1900 + y : 2000 + y).toString();
}

function normalizeDateParts(dd, mm, yyyy) {
    const D = parseInt(dd, 10);
    const M = parseInt(mm, 10);
    const Y = parseInt(yyyy, 10);
    if (!D || !M || !Y) return null;
    if (D < 1 || D > 31 || M < 1 || M > 12) return null;
    return { day: D, month: M, year: Y };
}

function digitsFromDateObj(dateObj, excludeZeros = true) {
    // Вернём массив символов-цифр (без разделителей). По общепринятой практике нули можно не учитывать в матрице.
    const s = `${pad2(dateObj.day)}${pad2(dateObj.month)}${dateObj.year}`;
    const arr = s.split('').map(ch => parseInt(ch, 10));
    if (excludeZeros) return arr.filter(d => d !== 0);
    return arr;
}

function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
}

function sumDigits(n) {
    return String(n).split('').reduce((s, ch) => s + Number(ch), 0);
}

function reduceWithMasters(n) {
    // Сохраняем мастера 11,22,33 (если именно они получаются) — иначе редуцируем до 1..9
    if (n === 11 || n === 22 || n === 33) return n;
    let x = n;
    while (x > 9) {
        x = sumDigits(x);
        if (x === 11 || x === 22 || x === 33) return x;
    }
    return x;
}

function countDigits(arr) {
    const counts = Array(10).fill(0);
    for (const d of arr) {
        if (d >= 0 && d <= 9) counts[d]++;
    }
    return counts; // counts[0]..counts[9]
}

function filenameSafe(dateObj) {
    return `matrix_${pad2(dateObj.day)}${pad2(dateObj.month)}${dateObj.year}.pdf`;
}

// --- Значения и интерпретации для каждой цифры (детально) ---
const DIGIT_MEANINGS = {
    1: {
        title: '1 — Лидерство, инициатива, воля',
        text: `Цифра 1 отвечает за силу воли, инициативу, стремление лидировать. Люди с яркой единицей склонны брать на себя ответственность, начинать проекты и прорваться там, где другие сомневаются. Негативно — упрямство, эго, трудности с командной работой.`
    },
    2: {
        title: '2 — Чувство, дипломатия, сотрудничество',
        text: `Двойка связана с чувствительностью, умением слышать других и договариваться. Сильная двойка — хороший партнер, медиатор. Слабо выраженная — сложности с доверием и близостью.`
    },
    3: {
        title: '3 — Творчество, самовыражение, коммуникация',
        text: `Тройка — энергия творчества, артистичность, харизма. Помогает в публичных выступлениях, креативных профессиях. В избытке — поверхностность и шум.`
    },
    4: {
        title: '4 — Практичность, стабильность, труд',
        text: `Четвёрка приносит упорство, организацию, способность доводить дела до конца. Люди «четвёрки» ценят порядок. В негативе — ригидность, страх изменений.`
    },
    5: {
        title: '5 — Свобода, перемены, искатель приключений',
        text: `Пятёрка — тяга к изменениям, независимость, гибкость. Помогает адаптироваться, но в избытке может приносить непостоянство и рискованные решения.`
    },
    6: {
        title: '6 — Ответственность, забота, семейные ценности',
        text: `Шестёрка — про ответственность, заботу о близких, чувство долга. Хороша в ролях покровителя и наставника. В тёмной стороне — чрезмерная опека.`
    },
    7: {
        title: '7 — Аналитика, духовность, уединение',
        text: `Семёрка тянет к медитации, знаниям, исследованию внутреннего мира. Это знак аналитиков, философов. Отсутствие — поверхностность; избыток — уход в уединение.`
    },
    8: {
        title: '8 — Власть, деньги, управленческие способности',
        text: `Восьмёрка — про материальный успех, управление ресурсами и амбицию. Хорошо проявляется в бизнесе. Негативно — материализм, жёсткость.`
    },
    9: {
        title: '9 — Милосердие, масштаб, завершение',
        text: `Девятка несёт идеалы, способность к эмпатии, помощь другим. Это энергия завершения циклов и глобального мышления. В тёмную — самоотверженность до самопожертвования.`
    }
};

// --- Главная логика анализа ---
function analyzeByDate(dateObj) {
    const digits = digitsFromDateObj(dateObj, true); // исключаем нули
    const counts = countDigits(digits); // counts[0..9]

    // Матрица 3x3: 1 2 3 / 4 5 6 / 7 8 9
    const matrix = [
        [counts[1], counts[2], counts[3]],
        [counts[4], counts[5], counts[6]],
        [counts[7], counts[8], counts[9]],
    ];

    // Триады (голова / сердце / тело)
    const triadHead = matrix[0].reduce((s, v) => s + v, 0); // 1-3
    const triadHeart = matrix[1].reduce((s, v) => s + v, 0); // 4-6
    const triadBody = matrix[2].reduce((s, v) => s + v, 0); // 7-9

    // Строки, столбцы, диагонали
    const rowSums = matrix.map(r => r.reduce((s, v) => s + v, 0));
    const colSums = [matrix[0][0] + matrix[1][0] + matrix[2][0],
                     matrix[0][1] + matrix[1][1] + matrix[2][1],
                     matrix[0][2] + matrix[1][2] + matrix[2][2]];
    const diag1 = matrix[0][0] + matrix[1][1] + matrix[2][2];
    const diag2 = matrix[0][2] + matrix[1][1] + matrix[2][0];

    // Суммы компонентов даты
    const dayDigits = String(pad2(dateObj.day)).split('').map(Number);
    const monthDigits = String(pad2(dateObj.month)).split('').map(Number);
    const yearDigits = String(dateObj.year).split('').map(Number);

    const sumDay = dayDigits.reduce((s, x) => s + x, 0);
    const sumMonth = monthDigits.reduce((s, x) => s + x, 0);
    const sumYear = yearDigits.reduce((s, x) => s + x, 0);

    const totalRaw = sumDay + sumMonth + sumYear;
    const lifePathRaw = totalRaw;
    const lifePath = reduceWithMasters(lifePathRaw);

    // Кармические долги — если totalRaw равен 13,14,16,19 (традиционно)
    const karmicDebts = [];
    [13,14,16,19].forEach(k => { if (lifePathRaw === k) karmicDebts.push(k); });

    // Доминирующие и отсутствующие цифры
    const present = [];
    const absent = [];
    for (let d = 1; d <= 9; d++) {
        if (counts[d] > 0) present.push({d, count: counts[d]});
        else absent.push(d);
    }
    // Сортируем доминирующие по убыванию
    present.sort((a,b) => b.count - a.count);

    // Определяем рекомендации: на основе отсутствующих и доминирующих
    const recommendations = [];
    if (absent.length > 0) {
        recommendations.push(`Отсутствующие цифры (кармические уроки): ${absent.join(', ')}. Рекомендация: работать над качествами этих цифр — например, вернуть в жизнь элементы, которые помогают компенсировать пробелы.`);
    } else {
        recommendations.push('Все цифры представлены — хорошо сбалансированная матрица. Следи за перекосами в количестве повторов (слишком сильные доминанты).');
    }
    if (present.length > 0) {
        const top = present.slice(0,3).map(p => `${p.d}(${p.count})`).join(', ');
        recommendations.push(`Доминирующие цифры: ${top}. Они задают основные акценты судьбы — используй их силу сознательно.`);
    }

    // Возвращаем объект с анализом
    return {
        dateObject: dateObj,
        digits,
        counts,
        matrix,
        triadHead, triadHeart, triadBody,
        rowSums, colSums, diag1, diag2,
        sumDay, sumMonth, sumYear,
        lifePathRaw, lifePath,
        karmicDebts,
        present, absent,
        recommendations
    };
}

// --- Вывод / генерация PDF ---
async function createPDFReport(analysis, outFilename) {

    const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 48, bottom: 48, left: 56, right: 56 }
    });

    const stream = fs.createWriteStream(outFilename);
    doc.pipe(stream);

    // Загружаем шрифты как Buffer
    const regularFontBuffer = FONT_REGULAR;
    const boldFontBuffer = FONT_BOLD;
    console.log(regularFontBuffer);
    
    // Шапка
    doc.font(FONT_REGULAR).fontSize(22).text('Матрица судьбы', { align: 'center' });
    doc.moveDown(0.3);
    const dob = analysis.dateObject;
    doc.font(regularFontBuffer).fontSize(12).text(`Дата рождения: ${pad2(dob.day)}.${pad2(dob.month)}.${dob.year}`, { align: 'center' });
    doc.moveDown(0.8);

    // Краткие ключевые числа
    doc.fontSize(11).font(boldFontBuffer).text('Ключевые числа:', { continued: false });
    const lifePathStr = (analysis.lifePath === 11 || analysis.lifePath === 22 || analysis.lifePath === 33)
        ? `${analysis.lifePath} (мастер-число)`
        : `${analysis.lifePath}`;
    doc.font(regularFontBuffer).fontSize(10).list([
        `Число жизненного пути: ${lifePathStr} (сумма цифр даты = ${analysis.lifePathRaw})`,
        `День (сумма): ${analysis.sumDay}`,
        `Месяц (сумма): ${analysis.sumMonth}`,
        `Год (сумма): ${analysis.sumYear}`,
        analysis.karmicDebts.length ? `Возможные кармические долги: ${analysis.karmicDebts.join(', ')}` : 'Кармических долгов (13/14/16/19) явно не видно в сумме'
    ], { bulletRadius: 2 });
    doc.moveDown(0.8);

    // Рисуем матрицу 3x3
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const gridSize = Math.min(220, pageWidth * 0.45);
    const gridX = doc.page.margins.left;
    const gridY = doc.y;
    const cellSize = gridSize / 3;

    doc.fontSize(10).font(boldFontBuffer).text('Матрица (цифры и их частота):', gridX, gridY - 6);
    // draw grid
    const startY = doc.y + 6;
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const x = gridX + c * cellSize;
            const y = startY + r * cellSize;
            doc.rect(x, y, cellSize, cellSize).lineWidth(0.7).stroke();

            const digit = r * 3 + c + 1;
            const count = analysis.matrix[r][c];

            // цифра вверху слева
            doc.font(boldFontBuffer).fontSize(12).text(String(digit), x + 6, y + 6);

            // число повторов вверху справа
            doc.font(regularFontBuffer).fontSize(11).text(count ? String(count) : '-', x + cellSize - 24, y + 6, { width: 18, align: 'right' });

            // короткое значение посередине
            const shortMeaning = DIGIT_MEANINGS[digit].title;
            doc.fontSize(8).text(shortMeaning, x + 6, y + 26, { width: cellSize - 12, height: cellSize - 32 });
        }
    }

    // Смещение курсора вправо от сетки
    const rightColX = gridX + gridSize + 20;
    let cursorY = startY;

    // Триады и линии
    doc.fontSize(11).font(boldFontBuffer).text('Анализ триад и линий:', rightColX, cursorY - 6);
    doc.font(regularFontBuffer).fontSize(10);
    const triadEx = [
        `Голова (1–3): ${analysis.triadHead} — ${interpretTriad('head', analysis.triadHead)}`,
        `Сердце (4–6): ${analysis.triadHeart} — ${interpretTriad('heart', analysis.triadHeart)}`,
        `Тело (7–9): ${analysis.triadBody} — ${interpretTriad('body', analysis.triadBody)}`,
        `Суммы по строкам: ${analysis.rowSums.join(' / ')}`,
        `Суммы по столбцам: ${analysis.colSums.join(' / ')}`,
        `Диагонали: ${analysis.diag1} (\\), ${analysis.diag2} (/)`
    ];
    doc.list(triadEx, { bulletRadius: 2, x: rightColX, width: pageWidth - gridSize - 20 });
    cursorY = Math.max(cursorY + 120, doc.y + 6);

    doc.moveDown(1);

    // Подробные интерпретации по каждой цифре
    doc.addPage();
    doc.fontSize(16).font(boldFontBuffer).text('Подробный разбор по цифрам', { align: 'center' });
    doc.moveDown(0.4);
    doc.font(regularFontBuffer).fontSize(11);
    for (let d = 1; d <= 9; d++) {
        const cnt = analysis.counts[d];
        doc.font(boldFontBuffer).fontSize(13).text(`${d}. ${DIGIT_MEANINGS[d].title} — повторов: ${cnt}`);
        doc.moveDown(0.08);
        doc.font(regularFontBuffer).fontSize(10).text(DIGIT_MEANINGS[d].text, { align: 'justify' });
        doc.moveDown(0.06);

        // Индивидуальная интерпретация в зависимости от количества
        doc.fontSize(10).text(generateCountInterpretation(d, cnt), { italic: false });
        doc.moveDown(0.6);
    }

    // Страница с выводами и рекомендациями
    doc.addPage();
    doc.fontSize(16).font(boldFontBuffer).text('Выводы и персональные рекомендации', { align: 'center' });
    doc.moveDown(0.5);
    doc.font(regularFontBuffer).fontSize(11);

    doc.font(boldFontBuffer).text('Доминирующие черты:');
    const topThree = analysis.present.slice(0, 3).map(p => `${p.d} (повторов ${p.count})`);
    doc.font(regularFontBuffer).text(topThree.length ? topThree.join(', ') : 'Нет выраженных доминант');

    doc.moveDown(0.4);
    doc.font(boldFontBuffer).text('Отсутствующие цифры (кармические уроки):');
    doc.font(regularFontBuffer).text(analysis.absent.length ? analysis.absent.join(', ') : 'Отсутствующих цифр нет');

    doc.moveDown(0.4);
    doc.font(boldFontBuffer).text('Рекомендации:');
    doc.font(regularFontBuffer).list(analysis.recommendations, { bulletRadius: 2 });

    doc.moveDown(0.6);
    doc.font(boldFontBuffer).text('Практические шаги на ближайшее время:');
    doc.font(regularFontBuffer).list([
        'Включи в жизнь практики, компенсирующие отсутствующие цифры — например, если нет 4, налаживай распорядок и маленькие ритуалы дисциплины.',
        'Если есть сильная 8 или 1 — работай над эмпатией и делегированием, чтобы избежать авторитарности.',
        'Раз в месяц анализируй матрицу заново и фиксируй изменения (иногда структура меняется с течением лет).'
    ], { bulletRadius: 2 });

    doc.moveDown(0.6);
    doc.fontSize(9).text(`Файл сгенерирован автоматически. Для расширенного разбора (включая имя — числа характера/выражения/душевные числа) пришли полное имя и отчество и я добавлю в отчёт.`, { align: 'left' });

    // Подвал
    doc.moveDown(1.5);
    doc.fontSize(8).text(`Сформировано: ${new Date().toLocaleString('ru-RU')}`, { align: 'right' });

    doc.end();

    // Возвращаем Promise для ожидания завершения записи
    return new Promise((resolve, reject) => {
        stream.on('finish', () => resolve(outFilename));
        stream.on('error', reject);
    });
}

// --- Вспомогательные текстовые генераторы ---
function interpretTriad(kind, value) {
    if (kind === 'head') {
        if (value === 0) return 'мало мысли и инициативы — работа над мышлением';
        if (value <= 1) return 'слабая аналитическая активность';
        if (value <= 3) return 'баланс мышления';
        return 'сильное ментальное начало — лидерство в идеях';
    }
    if (kind === 'heart') {
        if (value === 0) return 'эмоции и чувственность подавлены';
        if (value <= 1) return 'скромная эмпатия';
        if (value <= 3) return 'гармоничная чувствительность';
        return 'сильная эмоциональная направленность, забота о других';
    }
    if (kind === 'body') {
        if (value === 0) return 'слабая приземлённость, практичность';
        if (value <= 1) return 'небольшая приземлённость';
        if (value <= 3) return 'достаточная практичность';
        return 'очень сильная приземлённая энергия, фокус на результатах';
    }
    return '';
}

function generateCountInterpretation(digit, count) {
    if (count === 0) {
        return `Цифра ${digit} отсутствует. Это означает (в традиционных толкованиях) кармический пробел: нужно работать над качествами, соответствующими этой цифре. Например: ${DIGIT_MEANINGS[digit].title}. Рекомендация — сознательно включать практики, развивающие эту сторону.`;
    }
    if (count === 1) {
        return `Цифра ${digit} выражена слабо (1 повтор) — качество присутствует, но не доминирует. Поддерживай его, чтобы оно стало ресурсом.`;
    }
    if (count === 2 || count === 3) {
        return `Цифра ${digit} выражена заметно (${count} повтора) — это одно из важных направлений в жизни. Используй силу цифры, но следи за перестройкой; баланс важен.`;
    }
    return `Цифра ${digit} выражена очень сильно (${count} повторов) — это одна из доминант матрицы. Эта сила велика, но может давать перекосы; рекомендовано сознательное управление этим качеством.`;
}

// --- CLI ---
async function main() {
    console.log('=== Матрица судьбы — генератор PDF (A4). ===\n');
    console.log('Формат ввода даты: дд.мм.гггг или дд-мм-гггг или yyyy-mm-dd\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (q) => new Promise(res => rl.question(q, ans => res(ans)));

    const input = await question('Введите дату рождения (пример 07.05.1991): ');
    rl.close();

    const dateObj = parseDateInput(input);
    if (!dateObj) {
        console.error('Не удалось распознать дату. Убедитесь в формате дд.мм.гггг');
        process.exit(1);
    }

    // Анализ
    const analysis = analyzeByDate(dateObj);

    // Создание PDF
    const out = filenameSafe(dateObj);
    console.log('Генерируем PDF, подожди...');

    try {
        await createPDFReport(analysis, out);
        console.log(`Готово! Файл сгенерирован: ${out}`);
    } catch (err) {
        console.error('Ошибка при создании PDF:', err);
    }
}

main();