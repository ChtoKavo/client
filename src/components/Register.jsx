import React, { useState, useRef, useEffect } from 'react';
import './Register.css';

const Register = ({ onRegister, onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    email: '',
    nick: '',
    password: '',
    confirmPassword: '',
    categories: []
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('personal'); // personal -> credentials -> categories -> confirm
  const [confirmationCode, setConfirmationCode] = useState(['', '', '', '', '', '']);
  const [userEmail, setUserEmail] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [canResend, setCanResend] = useState(false);

  const inputRefs = useRef([]);
  const API_BASE_URL = 'http://151.241.228.247:5001';

  // Категории для выбора
  const availableCategories = [
    { id: 1, name: 'Искусство', icon: '🎨' },
    { id: 2, name: 'Музыка', icon: '🎵' },
    { id: 3, name: 'Спорт', icon: '⚽' },
    { id: 4, name: 'Технологии', icon: '💻' },
    { id: 5, name: 'Наука', icon: '🔬' },
    { id: 6, name: 'Путешествия', icon: '✈️' },
    { id: 7, name: 'Еда', icon: '🍕' },
    { id: 8, name: 'Кино', icon: '🎬' },
    { id: 9, name: 'Книги', icon: '📚' },
    { id: 10, name: 'Игры', icon: '🎮' }
  ];

  // Таймер обратного отсчета
  useEffect(() => {
    if (timeLeft <= 0) {
      setCanResend(true);
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft(timeLeft - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeLeft]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleCategoryToggle = (categoryId) => {
    setFormData(prev => {
      const categories = prev.categories.includes(categoryId)
        ? prev.categories.filter(id => id !== categoryId)
        : [...prev.categories, categoryId];
      return { ...prev, categories };
    });
  };

  const validatePersonalInfo = () => {
    if (!formData.name.trim()) {
      setError('Имя обязательно для заполнения');
      return false;
    }
    if (!formData.surname.trim()) {
      setError('Фамилия обязательна для заполнения');
      return false;
    }
    if (!formData.email.trim()) {
      setError('Email обязателен для заполнения');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Некорректный формат email');
      return false;
    }
    return true;
  };

  const validateCredentials = () => {
    if (formData.password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Пароли не совпадают');
      return false;
    }
    return true;
  };

  const validateCategories = () => {
    if (formData.categories.length === 0) {
      setError('Выберите хотя бы одну категорию интересов');
      return false;
    }
    return true;
  };

  const nextStep = () => {
    setError('');
    
    switch (step) {
      case 'personal':
        if (validatePersonalInfo()) {
          setStep('credentials');
        }
        break;
      case 'credentials':
        if (validateCredentials()) {
          setStep('categories');
        }
        break;
      case 'categories':
        if (validateCategories()) {
          setStep('terms');
        }
        break;
      default:
        break;
    }
  };

  const prevStep = () => {
    setError('');
    switch (step) {
      case 'credentials':
        setStep('personal');
        break;
      case 'categories':
        setStep('credentials');
        break;
      case 'terms':
        setStep('categories');
        break;
      case 'confirm':
        setStep('terms');
        break;
      default:
        break;
    }
  };

  const handleCodeChange = (index, value) => {
    const sanitizedValue = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    if (sanitizedValue.length <= 1) {
      const newCode = [...confirmationCode];
      newCode[index] = sanitizedValue;
      setConfirmationCode(newCode);

      if (sanitizedValue && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!confirmationCode[index] && index > 0) {
        const newCode = [...confirmationCode];
        newCode[index - 1] = '';
        setConfirmationCode(newCode);
        inputRefs.current[index - 1]?.focus();
      } else if (confirmationCode[index]) {
        const newCode = [...confirmationCode];
        newCode[index] = '';
        setConfirmationCode(newCode);
      }
    }

    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodePaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    if (pasteData.length === 6) {
      const newCode = pasteData.split('');
      setConfirmationCode(newCode);
      inputRefs.current[5]?.focus();
    }
  };

  const getFullCode = () => {
    return confirmationCode.join('');
  };

  const sendConfirmationCode = async (email) => {
    try {
      const checkResponse = await fetch(`${API_BASE_URL}/users/check-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email })
      });

      const checkData = await checkResponse.json();
      
      if (checkResponse.ok && checkData.exists) {
        const resendResponse = await fetch(`${API_BASE_URL}/resend-confirmation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: email })
        });

        const resendData = await resendResponse.json();
        
        if (resendResponse.ok) {
          setTimeLeft(120);
          setCanResend(false);
          setUserEmail(email);
          setStep('confirm');
          setConfirmationCode(['', '', '', '', '', '']);
          return true;
        } else {
          setError(resendData.error || 'Ошибка отправки кода');
          return false;
        }
      } else {
        const response = await fetch(`${API_BASE_URL}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: formData.name,
            surname: formData.surname,
            nick: formData.nick || null,
            email: email,
            password: formData.password,
            categories: formData.categories
          })
        });

        const data = await response.json();
        
        if (response.ok) {
          setTimeLeft(120);
          setCanResend(false);
          setUserEmail(email);
          setStep('confirm');
          setConfirmationCode(['', '', '', '', '', '']);
          return true;
        } else {
          setError(data.error || 'Ошибка отправки кода');
          return false;
        }
      }
    } catch (error) {
      console.error('Ошибка отправки кода:', error);
      setError('Ошибка соединения с сервером');
      return false;
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (!acceptedTerms) {
      setError('Необходимо принять условия использования');
      return;
    }

    setLoading(true);
    await sendConfirmationCode(formData.email);
    setLoading(false);
  };

  const handleResendCode = async () => {
    if (!canResend) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE_URL}/resend-confirmation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: userEmail })
      });

      const data = await response.json();
      
      if (response.ok) {
        setTimeLeft(120);
        setCanResend(false);
        setError('Новый код отправлен на ваш email');
      } else {
        setError(data.error || 'Ошибка отправки кода');
      }
    } catch (error) {
      console.error('Ошибка повторной отправки:', error);
      setError('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');

    const fullCode = getFullCode();
    if (fullCode.length !== 6) {
      setError('Введите полный код подтверждения (6 символов)');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/confirm-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: userEmail, 
          confirmationCode: fullCode 
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        if (data.user && data.user.user_id && data.user.name && data.user.email) {
          onRegister(data.user);
        } else if (data.user_id && data.name && data.email) {
          onRegister(data);
        } else {
          throw new Error('Некорректные данные пользователя в ответе сервера');
        }
      } else {
        setError(data.error || 'Ошибка подтверждения email');
      }
    } catch (error) {
      console.error('Ошибка подтверждения:', error);
      setError(error.message || 'Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'confirm' && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [step]);

  const renderPersonalInfoForm = () => (
    <div className="register-container">
      <div className="sphere-1"></div>
      <div className="sphere-2"></div>
      <div className="sphere-3"></div>
      
      <div className="header-sphere">
        <div className="header-content">
          <button 
            className="back-button"
            onClick={onSwitchToLogin}
            type="button"
          >
            ← Назад
          </button>
          <h1 className="register-title">Регистрация</h1>
          <div className="step-indicator">Шаг 1 из 4</div>
        </div>
      </div>
      
      <div className="register-form">
        <form className="form-registration">
          <div className="form-group">
            <input
              className='inputlol'
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Введите ваше имя*"
            />
          </div>

          <div className="form-group">
            <input
              className='inputlol'
              type="text"
              id="surname"
              name="surname"
              value={formData.surname}
              onChange={handleChange}
              required
              placeholder="Введите вашу фамилию*"
            />
          </div>

          <div className="form-group">
            <input
              className='inputlol'
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="Введите ваш email*"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            type="button" 
            className="register-button"
            onClick={nextStep}
          >
            Продолжить
          </button>
        </form>

        <div className="switch-auth">
          <p>Уже есть аккаунт? 
            <span 
              className="switch-link" 
              onClick={onSwitchToLogin}
            >
              Войти
            </span>
          </p>
        </div>
      </div>
    </div>
  );

  const renderCredentialsForm = () => (
    <div className="register-container">
      <div className="sphere-1"></div>
      <div className="sphere-2"></div>
      <div className="sphere-3"></div>
      
      <div className="header-sphere">
        <div className="header-content">
          <button 
            className="back-button"
            onClick={prevStep}
            type="button"
          >
            ← Назад
          </button>
          <h1 className="register-title">Создание аккаунта</h1>
          <div className="step-indicator">Шаг 2 из 4</div>
        </div>
      </div>
      
      <div className="register-form">
        <form className="form-registration">
          <div className="form-group">
            <input
              className='inputlol'
              type="text"
              id="nick"
              name="nick"
              value={formData.nick}
              onChange={handleChange}
              placeholder="Введите ваш никнейм (необязательно)"
            />
          </div>

          <div className="form-group">
            <input
              className='inputlol'
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Введите пароль (мин. 6 символов)*"
            />
          </div>

          <div className="form-group">
            <input
              className='inputlol'
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              placeholder="Повторите пароль*"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            type="button" 
            className="register-button"
            onClick={nextStep}
          >
            Продолжить
          </button>
        </form>

        <div className="switch-auth">
          <p>Уже есть аккаунт? 
            <span 
              className="switch-link" 
              onClick={onSwitchToLogin}
            >
              Войти
            </span>
          </p>
        </div>
      </div>
    </div>
  );

  const renderCategoriesForm = () => (
    <div className="register-container">
      <div className="sphere-1"></div>
      <div className="sphere-2"></div>
      <div className="sphere-3"></div>
      
      <div className="header-sphere">
        <div className="header-content">
          <button 
            className="back-button"
            onClick={prevStep}
            type="button"
          >
            ← Назад
          </button>
          <h1 className="register-title">Выбор интересов</h1>
          <div className="step-indicator">Шаг 3 из 4</div>
        </div>
      </div>
      
      <div className="register-form">
        <div className="categories-description">
          Выберите категории, которые вас интересуют (можно выбрать несколько):
        </div>
        
        <div className="categories-grid">
  {availableCategories.map(category => (
    <div
      key={category.id}
      className={`category-card ${formData.categories.includes(category.id) ? 'selected' : ''}`}
      onClick={() => handleCategoryToggle(category.id)}
    >
      <button
        className={`category-button ${formData.categories.includes(category.id) ? 'selected' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          handleCategoryToggle(category.id);
        }}
      >
        <div className="category-icon">{category.icon}</div>
        <div className="category-name">{category.name}</div>
      </button>
    </div>
  ))}
</div>


        {error && <div className="error-message">{error}</div>}

        <button 
          type="button" 
          className="register-button"
          onClick={nextStep}
        >
          Продолжить
        </button>

        <div className="switch-auth">
          <p>Уже есть аккаунт? 
            <span 
              className="switch-link" 
              onClick={onSwitchToLogin}
            >
              Войти
            </span>
          </p>
        </div>
      </div>
    </div>
  );

  const renderTermsForm = () => (
    <div className="register-container">
      <div className="sphere-1"></div>
      <div className="sphere-2"></div>
      <div className="sphere-3"></div>
      
      <div className="header-sphere">
        <div className="header-content">
          <button 
            className="back-button"
            onClick={prevStep}
            type="button"
          >
            ← Назад
          </button>
          <h1 className="register-title">Завершение регистрации</h1>
          <div className="step-indicator">Шаг 4 из 4</div>
        </div>
      </div>
      
      <div className="register-form">
        <form className="form-registration" onSubmit={handleRegister}>
          <div className="terms-group">
            <label className="terms-label">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="terms-checkbox"
              />
              <span className="checkmark"></span>
              Я принимаю условия использования и даю согласие на обработку моих персональных данных
            </label>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            type="submit" 
            className="register-button"
            disabled={loading || !acceptedTerms}
          >
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <div className="switch-auth">
          <p>Уже есть аккаунт? 
            <span 
              className="switch-link" 
              onClick={onSwitchToLogin}
            >
              Войти
            </span>
          </p>
        </div>
      </div>
    </div>
  );

  const renderConfirmationForm = () => (
    <div className="register-container">
      <div className="sphere-1"></div>
      <div className="sphere-2"></div>
      <div className="sphere-3"></div>
      
      <div className="header-sphere">
        <div className="header-content">
          <button 
            className="back-button"
            onClick={prevStep}
            type="button"
          >
            ← Назад
          </button>
          <h1 className="register-title">Подтверждение</h1>
        </div>
      </div>
      
      <div className="register-form">
        <div className="confirmation-message">
          На адрес <span className="confirmation-email">{userEmail}</span> был отправлен код подтверждения.
        </div>
        <div className="confirmation-message">
          Введите код для завершения регистрации:
        </div>
        
        <form className="confirmation-form" onSubmit={handleConfirm}>
          <div className="code-inputs-container">
            {confirmationCode.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                className="code-input"
                type="text"
                value={digit}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleCodeKeyDown(index, e)}
                onPaste={handleCodePaste}
                maxLength="1"
                required
                autoComplete="off"
              />
            ))}
          </div>

          <div className="resend-section">
            {timeLeft > 0 ? (
              <div className="timer">
                Код действителен: <span className="time-left">{formatTime(timeLeft)}</span>
              </div>
            ) : (
              <button
                type="button"
                className="resend-button"
                onClick={handleResendCode}
                disabled={loading || !canResend}
              >
                {loading ? 'Отправка...' : 'Прислать новый код'}
              </button>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            type="submit" 
            className="confirm-button"
            disabled={loading || getFullCode().length !== 6}
          >
            {loading ? 'Подтверждение...' : 'Подтвердить email'}
          </button>
        </form>

        <div className="confirmation-switch">
          <p>Не получили код? 
            <span 
              className="confirmation-link" 
              onClick={() => setStep('personal')}
            >
              Вернуться к регистрации
            </span>
          </p>
        </div>
      </div>
    </div>
  );

  switch (step) {
    case 'personal':
      return renderPersonalInfoForm();
    case 'credentials':
      return renderCredentialsForm();
    case 'categories':
      return renderCategoriesForm();
    case 'terms':
      return renderTermsForm();
    case 'confirm':
      return renderConfirmationForm();
    default:
      return renderPersonalInfoForm();
  }
};

export default Register;