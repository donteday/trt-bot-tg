// actions/buyQuestions.js
const { Markup } = require("telegraf");
const db = require("../db");
const yookassa = require("../yookassa");
const { userStates } = require("../state/userStates");


/**
 * Обработка callback "buy_questions_X"
 * @param {TelegrafContext} ctx
 */
async function buyQuestionsAction(ctx) {
  try {
    const userId = ctx.from.id;
    const packageId = parseInt(ctx.match[1], 10);

    const packages = {
      1: { amount: 3, price: 49 },
      2: { amount: 10, price: 149 },
      3: { amount: 25, price: 299 },
      4: { amount: 50, price: 499 },
    };

    const selectedPackage = packages[packageId];
    if (!selectedPackage) {
      return ctx.reply("❌ Неверный пакет. Попробуйте снова.");
    }

    const user = await db.getUser(userId);

    // 🔹 Если email не указан — просим ввести
    if (!user.email) {
      await ctx.reply(
        "📧 Для оформления покупки нужен email для отправки чека.\n\nВведите ваш email:"
      );
      userStates.set(userId, {
        action: "buy_questions",
        amount: selectedPackage.amount,
      });
      return;
    }

    // 🔹 Создание платежа через YooKassa
    const payment = await yookassa.createPayment(
      userId,
      selectedPackage.price,
      `Покупка ${selectedPackage.amount} токенов`,
      user.email,
      selectedPackage.amount
    );

    await ctx.reply(
      `💳 Для покупки ${selectedPackage.amount} вопросов (${selectedPackage.price} ₽) перейдите по ссылке:\n\n` +
        `После оплаты чек будет отправлен на email: ${user.email}\n\n` +
        `${payment.confirmation.confirmation_url}`,
      Markup.inlineKeyboard([
        Markup.button.url("💳 Оплатить", payment.confirmation.confirmation_url),
        Markup.button.callback("✏️ Изменить email", "change_email_before_payment"),
      ])
    );
  } catch (error) {
    if (error.response?.error_code === 403) {
      console.log("⚠️ Пользователь заблокировал бота:", ctx.from.id);
      return;
    }
    console.error("Ошибка при обработке покупки:", error);
    try {
      await ctx.reply("❌ Произошла ошибка. Попробуйте позже или напишите в поддержку.");
    } catch (_) {}
  }
}

module.exports = { buyQuestionsAction, userStates };
