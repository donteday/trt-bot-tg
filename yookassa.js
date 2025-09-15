const yooKassa = require('yookassa');
const db = require('./db.js');

const yookassa = new yooKassa({
  shopId: process.env.YOOKASSA_SHOP_ID,
  secretKey: process.env.YOOKASSA_SECRET_KEY
});

// Создание платежа
async function createPayment(userId, amount, description = "Покупка вопросов", email = null, tokensAmount) {
  try {
    const paymentData = {
      amount: {
        value: amount,
        currency: 'RUB'
      },
      confirmation: {
        type: 'redirect',
        return_url: `${process.env.BOT_URL}`
      },
      metadata: {
        userId: userId,
        amount: amount,
        tokensAmount: tokensAmount
      },
      payment_method_types: ['sbp', 'bank_card'],
      capture: true,
      description: description
    };

    // Добавляем email, если он указан
    if (email) {
      paymentData.receipt = {
        customer: {
          email: email
        },
        items: [
          {
            description: description,
            quantity: "1",
            amount: {
              value: amount,
              currency: 'RUB'
            },
            vat_code: 1, // НДС 20%
            payment_mode: 'full_payment',
            payment_subject: 'service'
          }
        ]
      };
    }

    const payment = await yookassa.createPayment(paymentData);

    // Сохраняем информацию о платеже
    await db.savePayment(userId, {
      id: payment.id,
      amount: payment.amount,
      status: payment.status,
      description: description
    });

    return payment;
  } catch (error) {
    console.error('Error creating payment:', error);
    throw error;
  }
}

// Проверка статуса платежа
async function checkPaymentStatus(paymentId) {
  try {
    const payment = await yookassa.getPayment(paymentId);
    return payment.status;
  } catch (error) {
    console.error('Error checking payment status:', error);
    throw error;
  }
}

// Обработка уведомлений от ЮКассы
async function handlePaymentNotification(notification) {
  try {
    const { object } = notification;
    
    if (object.status === 'succeeded') {
      // Обновляем статус платежа
      await db.updatePaymentStatus(object.id, 'succeeded');
      
      // Добавляем вопросы пользователю
      const userId = object.metadata.userId;
      const amount = Math.floor(object.amount.value / 100); // 100 рублей = 1 вопрос
      
      await db.addQuestionsAfterPayment(userId, amount);
      
      return { success: true, userId, amount };
    }
    
    return { success: false };
  } catch (error) {
    console.error('Error handling payment notification:', error);
    throw error;
  }
}

module.exports = {
  createPayment,
  checkPaymentStatus,
  handlePaymentNotification
};




