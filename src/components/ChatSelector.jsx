import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './ChatSelector.css';
import Search from '/public/search.png';
import Setting from '/public/settings.png';
import io from 'socket.io-client';

const ChatSelector = ({ currentUser }) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [userAvatars, setUserAvatars] = useState({});
  const [userStatuses, setUserStatuses] = useState({});
  const [socket, setSocket] = useState(null);
  
  const navigate = useNavigate();
  const API_BASE_URL = 'http://151.241.228.247:5001';

  // Инициализация WebSocket и загрузка данных
  useEffect(() => {
    if (currentUser) {
      loadChats();
      initializeWebSocket();
    }

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [currentUser]);

  // Отслеживание активности пользователя
  useEffect(() => {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    const handleActivity = () => {
      trackUserActivity();
    };

    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [socket, currentUser]);

  const initializeWebSocket = () => {
    const newSocket = io(API_BASE_URL, {
      withCredentials: true
    });

    setSocket(newSocket);

    // Регистрация пользователя
    newSocket.emit('register_user', currentUser.user_id);

    // Обработка новых сообщений
    newSocket.on('new_message', (message) => {
      console.log('Новое сообщение получено:', message);
      
      setChats(prevChats => {
        const updatedChats = prevChats.map(chat => {
          if (chat.chat_id === message.chat_id) {
            return {
              ...chat,
              last_message: message.content,
              last_message_time: message.created_at,
              last_message_sender_id: message.user_id,
              unread_count: message.user_id !== currentUser.user_id 
                ? (chat.unread_count || 0) + 1 
                : chat.unread_count
            };
          }
          return chat;
        });
        
        // Перемещаем чат с новым сообщением вверх
        const chatIndex = updatedChats.findIndex(chat => chat.chat_id === message.chat_id);
        if (chatIndex > 0) {
          const [chat] = updatedChats.splice(chatIndex, 1);
          updatedChats.unshift(chat);
        }
        
        return updatedChats;
      });

      // Показываем уведомление, если чат не активен
      if (window.location.pathname !== `/chat/${message.chat_id}`) {
        // Можно добавить системное уведомление
        console.log('Новое сообщение в чате:', message.chat_id);
      }
    });

    // Обновление статуса контакта
    newSocket.on('contact_status_updated', (data) => {
      console.log('Статус контакта обновлен:', data);
      setUserStatuses(prev => ({
        ...prev,
        [data.user_id]: {
          status: data.status,
          message: data.status_message,
          isOnline: data.status !== 'offline',
          lastSeen: data.last_seen || data.last_activity
        }
      }));
    });

    // Получение статусов пользователей
    newSocket.on('user_statuses_batch', (users) => {
      console.log('Получены статусы пользователей:', users);
      const newStatuses = {};
      users.forEach(user => {
        newStatuses[user.user_id] = {
          status: user.user_status || 'offline',
          message: user.status_message,
          isOnline: user.is_online,
          lastSeen: user.last_seen
        };
      });
      setUserStatuses(prev => ({ ...prev, ...newStatuses }));
    });

    // Обновление информации о чате
    newSocket.on('chat_updated', (chatData) => {
      console.log('Чат обновлен:', chatData);
      setChats(prevChats => {
        return prevChats.map(chat => {
          if (chat.chat_id === chatData.chat_id) {
            return {
              ...chat,
              last_message: chatData.last_message,
              last_message_time: chatData.last_message_time,
              last_message_sender_id: chatData.last_message_sender_id,
              unread_count: chatData.unread_count !== undefined 
                ? chatData.unread_count 
                : chat.unread_count
            };
          }
          return chat;
        });
      });
    });

    // Сообщения прочитаны
    newSocket.on('messages_read', (data) => {
      console.log('Сообщения прочитаны пользователем:', data);
      // Обновляем статус прочтения в UI
      setChats(prevChats => {
        return prevChats.map(chat => {
          if (chat.chat_id === data.chat_id) {
            return {
              ...chat,
              // Сбрасываем счетчик непрочитанных для текущего пользователя
              unread_count: 0
            };
          }
          return chat;
        });
      });
    });

    // Обработка ошибок подключения
    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setError('Ошибка подключения к серверу');
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected successfully');
      setError('');
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  };

  const trackUserActivity = () => {
    if (socket && currentUser) {
      socket.emit('user_activity', currentUser.user_id);
    }
  };

  const loadChats = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/chats/${currentUser.user_id}`);
      if (!response.ok) throw new Error('Ошибка загрузки чатов');
      const data = await response.json();
      setChats(data);
      
      // Загружаем аватары и статусы для всех участников чатов
      await loadAvatarsAndStatusesForChats(data);
    } catch (error) {
      console.error('Ошибка загрузки чатов:', error);
      setError('Ошибка загрузки чатов');
    } finally {
      setLoading(false);
    }
  };

  // Функция для загрузки аватаров и статусов участников чатов
  const loadAvatarsAndStatusesForChats = async (chatsData) => {
    const participantIds = new Set();
    
    chatsData.forEach(chat => {
      const ids = chat.participant_ids?.split(',').filter(id => id !== currentUser.user_id.toString()) || [];
      ids.forEach(id => participantIds.add(id));
    });

    // Подписываемся на статусы пользователей через WebSocket
    if (socket && participantIds.size > 0) {
      socket.emit('subscribe_to_statuses', Array.from(participantIds));
    }

    // Загружаем аватары через API
    const promises = Array.from(participantIds).map(async (participantId) => {
      if (!userAvatars[participantId]) {
        await loadUserAvatar(participantId);
      }
    });
    
    await Promise.all(promises);
  };

  // Функция для загрузки аватара пользователя
  const loadUserAvatar = async (userId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}/avatar`);
      if (response.ok) {
        const blob = await response.blob();
        const avatarUrl = URL.createObjectURL(blob);
        setUserAvatars(prev => ({
          ...prev,
          [userId]: avatarUrl
        }));
      }
    } catch (error) {
      console.log(`Аватар для пользователя ${userId} не найден, используем заглушку`);
    }
  };

  // Функция для получения расширенного статуса из базы данных
  const getUserStatus = async (userId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}/status`);
      if (response.ok) {
        const userStatus = await response.json();
        return {
          status: userStatus.user_status || 'offline',
          message: userStatus.status_message,
          isOnline: userStatus.is_online,
          lastSeen: userStatus.last_seen
        };
      }
    } catch (error) {
      console.error('Ошибка получения статуса:', error);
    }
    return { status: 'offline', message: null, isOnline: false, lastSeen: null };
  };

  // Функция для установки собственного статуса
  const setUserStatus = async (status, message = null) => {
    try {
      // Отправляем через WebSocket для мгновенного обновления
      if (socket) {
        socket.emit('update_user_status', {
          user_id: currentUser.user_id,
          status: status,
          status_message: message
        });
      }

      // Также отправляем через REST API для надежности
      const response = await fetch(`${API_BASE_URL}/api/users/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: currentUser.user_id,
          status: status,
          status_message: message
        })
      });
      
      if (response.ok) {
        // Обновляем локальный статус
        setUserStatuses(prev => ({
          ...prev,
          [currentUser.user_id]: {
            status,
            message,
            isOnline: status !== 'offline',
            lastSeen: new Date().toISOString()
          }
        }));
        console.log('Статус обновлен:', status);
      }
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
    }
  };

  // Функция для получения аватара участника чата
  const getParticipantAvatar = (chat) => {
    const participantIds = chat.participant_ids?.split(',').filter(id => id !== currentUser.user_id.toString()) || [];
    if (participantIds.length > 0) {
      const participantId = participantIds[0];
      return userAvatars[participantId] || null;
    }
    return null;
  };

  // Функция для получения аватара пользователя при поиске
  const getUserAvatar = (userId) => {
    return userAvatars[userId] || null;
  };

  // Функция для получения статуса пользователя
  const getUserStatusFromState = (userId) => {
    return userStatuses[userId] || { status: 'offline', message: null, isOnline: false, lastSeen: null };
  };

  const searchUsers = async (query) => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/users/search/${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Ошибка поиска пользователей');
      const data = await response.json();
      
      const filteredUsers = data.filter(user => user.user_id !== currentUser.user_id);
      setUsers(filteredUsers);
      
      // Загружаем аватары и статусы найденных пользователей
      filteredUsers.forEach(user => {
        if (!userAvatars[user.user_id]) {
          loadUserAvatar(user.user_id);
        }
      });

      // Подписываемся на статусы найденных пользователей
      if (socket) {
        const userIds = filteredUsers.map(user => user.user_id);
        socket.emit('subscribe_to_statuses', userIds);
      }
    } catch (error) {
      console.error('Ошибка поиска пользователей:', error);
      setError('Ошибка поиска пользователей');
    }
  };

  const createChat = async (participantId) => {
    try {
      setError('');
      console.log('Создание чата между:', currentUser.user_id, 'и', participantId);

      const checkResponse = await fetch(
        `${API_BASE_URL}/chats/check/${currentUser.user_id}/${participantId}`
      );
      
      if (!checkResponse.ok) {
        throw new Error(`Ошибка проверки чата: ${checkResponse.status}`);
      }
      
      const checkData = await checkResponse.json();
      console.log('Результат проверки чата:', checkData);
      
      if (checkData.exists) {
        console.log('Чат существует, переход к чату:', checkData.chat_id);
        
        // Отмечаем сообщения как прочитанные при открытии чата
        if (socket) {
          socket.emit('mark_messages_read', {
            chat_id: checkData.chat_id,
            user_id: currentUser.user_id
          });
        }
        
        navigate(`/chat/${checkData.chat_id}`);
      } else {
        console.log('Создание нового чата...');
        const response = await fetch(`${API_BASE_URL}/chats`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: parseInt(currentUser.user_id),
            participant_id: parseInt(participantId),
            chat_type: 'private'
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ошибка создания чата: ${response.status} - ${errorText}`);
        }
        
        const newChat = await response.json();
        console.log('Новый чат создан:', newChat);
        
        setShowUserSearch(false);
        setSearchQuery('');
        setUsers([]);
        
        navigate(`/chat/${newChat.chat_id}`);
      }
    } catch (error) {
      console.error('Ошибка создания чата:', error);
      setError(`Ошибка создания чата: ${error.message}`);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин`;
    if (diffHours < 24) return `${diffHours} ч`;
    if (diffDays === 1) return 'вчера';
    if (diffDays < 7) return `${diffDays} д`;
    
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short'
    });
  };

  const getDisplayTime = (chat) => {
    if (!chat.last_message_time) return '';
    
    const date = new Date(chat.last_message_time);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
      return date.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    } else if (diffDays === 1) {
      return 'вчера';
    } else if (diffDays < 7) {
      return `${diffDays} д`;
    } else if (diffDays < 365) {
      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short'
      });
    } else {
      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
  };

  const getOtherParticipants = (chat) => {
    return chat.participant_names?.split(',')
      .filter(name => name.trim() !== currentUser.name)
      .join(', ') || 'Пользователь';
  };

  const getLastMessagePreview = (chat) => {
    if (!chat.last_message) return 'Нет сообщений';
    
    if (chat.is_draft) {
      return `Черновик: ${chat.last_message}`;
    }
    
    const message = chat.last_message;
    if (message.length > 60) {
      return message.substring(0, 60) + '...';
    }
    return message;
  };

  // Функция для определения статуса прочтения сообщения
  const getReadStatus = (chat) => {
    if (!chat.last_message_sender_id) return 'sent';
    
    // Если сообщение от текущего пользователя, проверяем прочитано ли оно
    if (chat.last_message_sender_id === currentUser.user_id) {
      return chat.is_read ? 'read' : 'sent';
    }
    
    // Если сообщение от другого пользователя, оно всегда считается "полученным"
    return 'received';
  };

  const handleChatClick = (chat) => {
    // Отмечаем сообщения как прочитанные при клике на чат
    if (socket) {
      socket.emit('mark_messages_read', {
        chat_id: chat.chat_id,
        user_id: currentUser.user_id
      });
    }
    
    // Сбрасываем счетчик непрочитанных локально
    setChats(prevChats => 
      prevChats.map(c => 
        c.chat_id === chat.chat_id ? { ...c, unread_count: 0 } : c
      )
    );
    
    navigate(`/chat/${chat.chat_id}`);
  };

  const filteredChats = chats.filter(chat => {
    if (activeTab === 'all') return true;
    if (activeTab === 'personal') return chat.chat_type === 'private';
    if (activeTab === 'new') return chat.unread_count > 0;
    if (activeTab === 'folder') return chat.folder_id !== null;
    return true;
  });

  // Компонент для выбора статуса
  const StatusSelector = () => {
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const currentStatus = getUserStatusFromState(currentUser.user_id);

    const statusOptions = [
      { value: 'online', label: 'В сети', description: 'Доступен для общения' },
      { value: 'away', label: 'Отошел', description: 'Вернусь через несколько минут' },
      { value: 'dnd', label: 'Не беспокоить', description: 'Не беспокоить кроме срочных вопросов' },
      { value: 'sleep', label: 'Сон', description: 'Сплю, отвечу утром' },
      { value: 'offline', label: 'Не в сети', description: 'Не в сети' }
    ];

    const handleStatusChange = async (newStatus) => {
      await setUserStatus(newStatus);
      setShowStatusMenu(false);
    };

    const currentStatusConfig = statusOptions.find(opt => opt.value === currentStatus.status) || statusOptions[0];

    return (
      <div className="status-selector-container">
        <button 
          className="status-selector-btn"
          onClick={() => setShowStatusMenu(!showStatusMenu)}
        >
          <div className="current-status">
            <div className={`status-dot ${currentStatus.status}`}></div>
            <span className="status-text">{currentStatusConfig.label}</span>
            <span className="dropdown-arrow">▼</span>
          </div>
        </button>

        {showStatusMenu && (
          <div className="status-menu">
            {statusOptions.map(option => (
              <div
                key={option.value}
                className={`status-option ${currentStatus.status === option.value ? 'active' : ''}`}
                onClick={() => handleStatusChange(option.value)}
              >
                <div className={`status-dot ${option.value}`}></div>
                <div className="status-info">
                  <div className="status-label">{option.label}</div>
                  <div className="status-description">{option.description}</div>
                </div>
                {currentStatus.status === option.value && (
                  <span className="checkmark">✓</span>
                )}
              </div>
            ))}
            
            <div className="status-custom-message">
              <input
                type="text"
                placeholder="Добавить сообщение статуса..."
                value={currentStatus.message || ''}
                onChange={(e) => {
                  const newStatus = { ...currentStatus, message: e.target.value };
                  setUserStatuses(prev => ({
                    ...prev,
                    [currentUser.user_id]: newStatus
                  }));
                }}
                onBlur={() => setUserStatus(currentStatus.status, currentStatus.message)}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  // Компонент для аватара с улучшенными индикаторами статуса
  const Avatar = ({ userId, chat, className = "chat-avatar-rounded", showStatus = true }) => {
    const [avatarError, setAvatarError] = useState(false);
    
    const avatarUrl = chat ? getParticipantAvatar(chat) : getUserAvatar(userId);
    const displayName = chat ? getOtherParticipants(chat) : users.find(u => u.user_id === userId)?.name || 'U';
    const userStatus = getUserStatusFromState(userId);

    const handleAvatarError = () => {
      setAvatarError(true);
    };

    return (
      <div className="avatar-container">
        <div className="avatar-wrapper">
          {avatarUrl && !avatarError ? (
            <img 
              src={avatarUrl} 
              alt="Avatar" 
              className={className}
              onError={handleAvatarError}
            />
          ) : (
            <div className={className}>
              {displayName.split(',')[0].charAt(0).toUpperCase()}
            </div>
          )}
          {showStatus && (
            
              <div className={`status-dot-mini ${userStatus.status}`}></div>
            
          )}
        </div>
      </div>
    );
  };

  // Компонент для отображения статуса в списке чатов
  const ChatStatus = ({ userId }) => {
    const status = getUserStatusFromState(userId);
    
    if (status.status === 'offline') {
      const lastSeen = status.lastSeen ? formatTime(status.lastSeen) : '';
      return lastSeen ? (
        <div className="chat-status">был(а) {lastSeen}</div>
      ) : null;
    }

    const statusLabels = {
      online: 'в сети',
      away: 'отошел',
      dnd: 'не беспокоить',
      sleep: 'спит'
    };

    return (
      <div className="chat-status-indicator">
        <span className="chat-status-text">
          {statusLabels[status.status] || 'в сети'}
          {status.message && ` • ${status.message}`}
        </span>
      </div>
    );
  };

  if (!currentUser) {
    return (
      <div className="chat-selector">
        <div className="auth-warning">
          <h3>Войдите в систему для использования мессенджера</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-selector-rounded">
      {/* Заголовок и кнопка настроек */}
      <div className="header-section">
        <h2>Чаты</h2>
        <button className="settings-btn">
          <img src={Setting} alt="Настройки" />
        </button>
      </div>

      {/* Выбор статуса */}
      <div className="status-section">
        <StatusSelector />
      </div>

      {/* Поисковая строка с иконкой */}
      <div className="search-section">
        <div className="search-container-rounded">
          <img src={Search} alt="Поиск" className="search-icon-wide" />
          <input
            type="text"
            placeholder="Поиск..."
            className="search-input-rounded"
            onClick={() => setShowUserSearch(true)}
          />
        </div>
      </div>

      {/* Панель с табами под поиском */}
      <div className="tabs-section">
        <div className="tabs-container-rounded">
          <button 
            className={`tab-rounded ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            Все
          </button>
          <button 
            className={`tab-rounded ${activeTab === 'personal' ? 'active' : ''}`}
            onClick={() => setActiveTab('personal')}
          >
            Личные
          </button>
          <button 
            className={`tab-rounded ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            Новые
          </button>
          <button 
            className={`tab-rounded ${activeTab === 'folder' ? 'active' : ''}`}
            onClick={() => setActiveTab('folder')}
          >
            Папка
          </button>
        </div>
      </div>

      {/* Список чатов */}
      <div className="chats-list-rounded">
        {loading && chats.length === 0 ? (
          <div className="loading-chats">
            <div className="spinner"></div>
            <span>Загрузка чатов...</span>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="no-chats">
            <div className="no-chats-icon">💬</div>
            <h3>Нет чатов</h3>
            <p>Начните общение, создав новый чат</p>
            <button 
              onClick={() => setShowUserSearch(true)}
              className="start-chat-btn"
            >
              Начать общение
            </button>
          </div>
        ) : (
          filteredChats.map(chat => {
            const participantIds = chat.participant_ids?.split(',').filter(id => id !== currentUser.user_id.toString()) || [];
            const mainParticipantId = participantIds[0];
            
            return (
              <div 
                key={chat.chat_id}
                className="chat-item-rounded"
                onClick={() => handleChatClick(chat)}
              >
                <Avatar chat={chat} />
                
                <div className="chat-content-rounded">
                  <div className="chat-header-rounded">
                    <div className="chat-name-rounded">
                      {getOtherParticipants(chat)}
                    </div>
                    <div className="chat-time-rounded">
                      {getDisplayTime(chat)}
                    </div>
                  </div>
                  
                  <div className={`last-message-rounded ${chat.is_draft ? 'draft' : ''}`}>
                    {getLastMessagePreview(chat)}
                  </div>

                  {/* Статус пользователя под именем */}
                  {mainParticipantId && (
                    <ChatStatus userId={mainParticipantId} />
                  )}
                </div>

                <div className="chat-indicators-rounded">
                  {chat.unread_count > 0 && (
                    <div className="unread-count-rounded">{chat.unread_count}</div>
                  )}
                  <div className={`read-status ${getReadStatus(chat)}`}>
                    {getReadStatus(chat) === 'read' && '✓✓'}
                    {getReadStatus(chat) === 'sent' && '✓'}
                    {getReadStatus(chat) === 'received' && ''}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Кнопка нового чата */}
      <button 
        className="floating-new-chat-btn-rounded"
        onClick={() => setShowUserSearch(true)}
      >
        +
      </button>

      {/* Модальное окно поиска пользователей */}
      {showUserSearch && (
        <div className="modal-overlay-rounded">
          <div className="search-modal-rounded">
            <div className="modal-header-rounded">
              <h2>Новый чат</h2>
              <button 
                className="close-modal-rounded"
                onClick={() => {
                  setShowUserSearch(false);
                  setSearchQuery('');
                  setUsers([]);
                }}
              >
                ×
              </button>
            </div>
            
            <div className="modal-search-input-rounded">
              <img src={Search} alt="Поиск" className="search-icon-wide" />
              <input
                type="text"
                placeholder="Введите имя или email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  searchUsers(e.target.value);
                }}
                autoFocus
              />
            </div>
            
            <div className="search-results-rounded">
              {users.length > 0 ? (
                users.map(user => (
                  <div 
                    key={user.user_id}
                    className="user-result-rounded"
                    onClick={() => createChat(user.user_id)}
                  >
                    <Avatar userId={user.user_id} className="user-avatar-rounded" />
                    <div className="user-info-rounded">
                      <div className="user-name-rounded">{user.name}</div>
                      <div className="user-email-rounded">{user.email}</div>
                      <ChatStatus userId={user.user_id} />
                    </div>
                  </div>
                ))
              ) : searchQuery.trim() ? (
                <div className="no-results-rounded">Пользователи не найдены</div>
              ) : (
                <div className="no-results-rounded">Начните вводить имя или email</div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-toast-rounded">
          <span>{error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* Индикатор подключения WebSocket */}
      <div className={`connection-status ${socket?.connected ? 'connected' : 'disconnected'}`}>
        {socket?.connected ? '🟢 Онлайн' : '🔴 Офлайн'}
      </div>
    </div>
  );
};

export default ChatSelector;