// commands/love.js
const { Markup } = require("telegraf");
const { askOpenAIStreaming, userStreams } = require("../utils/streaming");
const { buildLovePromptShort } = require("../utils/lovePrompts");
const { isValidQuestion } = require("../utils/helpers");
const { userStates } = require("../state/userStates");
const { setLovePair } = require("../state/loveCache");

/**
 * Команда /love — пошаговый ввод для анализа совместимости
 */
async function loveCommand(ctx) {
  const userId = ctx.from.id;

  userStates.set(userId, { action: "love_step1" });
  await ctx.reply("💞 Введите имя и дату рождения первого человека\n(например: Антон 18.02.1995)");
}

/**
 * Обработка текста после /love
 */
async function handleLoveSteps(ctx) {
  const userId = ctx.from.id;
  const state = userStates.get(userId);
  const text = (ctx.message?.text || "").trim();

  // 🔹 Шаг 1 — ввод первого человека
  if (state?.action === "love_step1") {
    const match = text.match(/([A-Za-zА-Яа-яёЁ]+)\s+(\d{2}\.\d{2}\.\d{4})/);
    if (!match)
      return ctx.reply("❌ Введите имя и дату рождения в формате: Антон 18.02.1995");

    const [, name1, date1] = match;
    userStates.set(userId, { action: "love_step2", name1, date1 });

    return ctx.reply("💞 Теперь введите имя и дату рождения второго человека\n(например: Настя 10.04.2002)");
  }

  // 🔹 Шаг 2 — ввод второго человека и запуск анализа
  if (state?.action === "love_step2") {
    const match = text.match(/([A-Za-zА-Яа-яёЁ]+)\s+(\d{2}\.\d{2}\.\d{4})/);
    if (!match)
      return ctx.reply("❌ Введите имя и дату рождения в формате: Настя 10.04.2003");

    const [, name2, date2] = match;
    const { name1, date1 } = state;
    setLovePair(userId, name1, date1, name2, date2);
    userStates.delete(userId);

    const prompt = buildLovePromptShort(name1, date1, name2, date2);

    let currentText = "";
    let lastUpdate = Date.now();
    userStreams.set(userId, true);

    const waitingMsg = await ctx.reply("💞");
    (async () => {
      try {
        await askOpenAIStreaming(
          userId,
          prompt,
          async (chunk) => {
            currentText += chunk;
            if (Date.now() - lastUpdate > 2000) {
              lastUpdate = Date.now();
              await ctx.telegram
                .editMessageText(
                  waitingMsg.chat.id,
                  waitingMsg.message_id,
                  undefined,
                  currentText + " 🔮"
                )
                .catch(() => { });
            }
          },
          async (finalText) => {
            try {
              // Финально редактируем текущее сообщение — только текст
              await ctx.telegram
                .editMessageText(
                  waitingMsg.chat.id,
                  waitingMsg.message_id,
                  undefined,
                  finalText
                )
                .catch(() => { });

              // 🆕 Отправляем отдельное сообщение с кнопкой
              // userStates.set(userId, {
              //   action: "love_full_ready",
              //   name1,
              //   date1,
              //   name2,
              //   date2
              // });
              console.log('Мини совместимость 💞', userId);

              await ctx.reply(
                "💞 Хочешь узнать, насколько вы с партнёром совместимы *на всех уровнях*?\n\n" +
                "🌟 Получи **полный астрологический и нумерологический разбор по 13 параметрам**, где я подробно покажу вашу энергию, карму и точки притяжения:\n\n" +
                "1. 🌞 Совместимость по знакам зодиака\n" +
                "2. 💫 Гармония стихий (огонь, вода, воздух, земля)\n" +
                "3. 🌗 Эмоциональные ритмы и лунная связь\n" +
                "4. 💕 Любовная энергия и страсть\n" +
                "5. 🧘 Баланс мужской и женской энергии\n" +
                "6. 💭 Ментальная и духовная связь\n" +
                "7. 💓 Эмоциональная глубина и чувственность\n" +
                "8. 🔥 Темперамент и динамика конфликтов\n" +
                "9. 👑 Роли в паре (лидер, вдохновитель, хранитель)\n" +
                "10. 🔢 Нумерологическая совместимость по числам судьбы\n" +
                "11. 🎯 Кармическая связь и уроки отношений\n" +
                "12. 💍 Потенциал семьи, брака и долгосрочного союза\n" +
                "13. 🃏 Совместимость по Арканам Таро — духовная миссия пары\n\n" +
                "✨ Этот анализ создаётся *индивидуально* — с вашими именами и датами рождения. " +
                "Он объединяет астрологию, нумерологию и Таро, создавая живую историю вашей связи 💫\n\n" +
                "Стоимость — 3 вопроса (готово примерно за 20–30 секунд).",
                {
                  parse_mode: "Markdown",
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "🔮 Получить полный разбор", callback_data: "love_full" }],
                    ],
                  },
                }
              );

            } catch (err) {
              console.error("Ошибка при финальном выводе:", err);
            } finally {
              userStreams.delete(userId);
            }
          }
        );
      } catch (error) {
        console.error("Ошибка в /love:", error);
        userStreams.delete(userId);
        await ctx.reply("❌ Что-то пошло не так, попробуйте ещё раз 🙏");
      }
    })();
  }

}

module.exports = { loveCommand, handleLoveSteps };