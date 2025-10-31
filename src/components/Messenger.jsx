import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import './Messenger.css';
import VoiceRecorder from './VoiceRecorder';

const Messenger = ({ currentUser }) => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  
  const [socket, setSocket] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  
  // Состояния для управления сообщениями
  const [contextMenu, setContextMenu] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  
  // Состояния для аватаров
  const [participantAvatars, setParticipantAvatars] = useState({});
  
  const messagesEndRef = useRef(null);
  const messageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const API_BASE_URL = 'http://151.241.228.247:5001';

  // Загрузка данных чата
  useEffect(() => {
    if (chatId && currentUser) {
      loadChatData();
      loadMessages();
      setupWebSocket();
    }
  }, [chatId, currentUser]);

  const loadParticipantAvatars = useCallback(async (chat) => {
    if (!chat || !chat.participant_ids) return;
    
    try {
      const participantIds = chat.participant_ids.split(',').map(id => parseInt(id.trim()));
      const avatars = {};
      
      for (const participantId of participantIds) {
        if (participantId === currentUser.user_id) continue;
        
        try {
          const response = await fetch(`${API_BASE_URL}/api/users/${participantId}/avatar`);
          if (response.ok) {
            const avatarBlob = await response.blob();
            // Проверяем, что это действительно изображение
            if (avatarBlob.type.startsWith('image/')) {
              const avatarUrl = URL.createObjectURL(avatarBlob);
              avatars[participantId] = avatarUrl;
            } else {
              avatars[participantId] = null;
            }
          } else {
            avatars[participantId] = null;
          }
        } catch (error) {
          console.error(`Ошибка загрузки аватара пользователя ${participantId}:`, error);
          avatars[participantId] = null;
        }
      }
      
      setParticipantAvatars(avatars);
    } catch (error) {
      console.error('Ошибка загрузки аватаров участников:', error);
    }
  }, [currentUser, API_BASE_URL]);

  const setupWebSocket = () => {
    if (!currentUser) return;

    const newSocket = io(API_BASE_URL, {
      transports: ['websocket', 'polling']
    });
    
    setSocket(newSocket);
    newSocket.emit('register_user', currentUser.user_id.toString());

    

newSocket.on('new_message', (message) => {
  console.log('Получено новое сообщение от сервера:', message);
  
  if (message.chat_id === parseInt(chatId)) {
    setMessages(prev => {
      // Просто добавляем сообщение, убираем всю логику временных сообщений
      const newMessage = {
        ...message,
        is_own: message.user_id === currentUser.user_id
      };
      
      // Проверяем, нет ли уже такого сообщения (защита от дубликатов)
      const messageExists = prev.some(msg => 
        msg.message_id === newMessage.message_id
      );
      
      if (!messageExists) {
        return [...prev, newMessage];
      }
      return prev;
    });
  }
});

    newSocket.on('message_updated', (updatedMessage) => {
      if (updatedMessage.chat_id === parseInt(chatId)) {
        setMessages(prev => prev.map(msg => 
          msg.message_id === updatedMessage.message_id 
            ? { ...updatedMessage, is_own: updatedMessage.user_id === currentUser.user_id }
            : msg
        ));
      }
    });

    newSocket.on('online_users_list', (userIds) => {
      setOnlineUsers(new Set(userIds));
    });

    newSocket.on('user_online', (userId) => {
      setOnlineUsers(prev => new Set([...prev, userId]));
    });

    newSocket.on('user_offline', (userId) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    });

    newSocket.on('message_error', (errorData) => {
      setError(errorData.error);
      setSending(false);
      setUploadingFile(false);
    });

    return () => {
      if (newSocket) {
        newSocket.close();
      }
    };
  };

  const loadChatData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/chats/${currentUser.user_id}`);
      if (!response.ok) throw new Error('Ошибка загрузки чатов');
      const chats = await response.json();
      const currentChat = chats.find(chat => chat.chat_id === parseInt(chatId));
      setActiveChat(currentChat);
      
      if (currentChat) {
        loadParticipantAvatars(currentChat);
      }
    } catch (error) {
      console.error('Ошибка загрузки данных чата:', error);
      setError('Чат не найден');
    }
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/messages/${chatId}?userId=${currentUser.user_id}`);
      if (!response.ok) throw new Error('Ошибка загрузки сообщений');
      const data = await response.json();
      
      const messagesWithOwnFlag = data.map(msg => ({
        ...msg,
        is_own: msg.user_id === currentUser.user_id
      }));
      
      setMessages(messagesWithOwnFlag);
    } catch (error) {
      console.error('Ошибка загрузки сообщений:', error);
      setError('Ошибка загрузки сообщений');
    } finally {
      setLoading(false);
    }
  };

  // Закрытие контекстного меню при клике вне его
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);



  const handleBackToChats = () => {
    navigate('/chats');
  };

  // Улучшенная функция для получения аватара пользователя
  const getUserAvatar = (userId, userName = '') => {
    return participantAvatars[userId] || null;
  };

  // Функция для получения инициалов пользователя
  const getUserInitials = (userName = '') => {
    const names = userName.trim().split(' ');
    if (names.length === 1) {
      return names[0].charAt(0).toUpperCase();
    }
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  };

  // Функция для показа контекстного меню
  const handleContextMenu = (e, message) => {
    e.preventDefault();
    
    if (message.is_own && message.message_type === 'text') {
      const menuWidth = 160;
      const menuHeight = 80;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let x = e.clientX;
      let y = e.clientY;
      
      if (x + menuWidth > viewportWidth) {
        x = viewportWidth - menuWidth - 10;
      }
      
      if (y + menuHeight > viewportHeight) {
        y = viewportHeight - menuHeight - 10;
      }
      
      x = Math.max(10, x - menuWidth / 2);
      
      setContextMenu({
        x: x,
        y: y,
        message: message
      });
    }
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const deleteMessage = async (message) => {
    try {
      if (message.is_sending || typeof message.message_id !== 'number' || message.message_id > 2000000000) {
        console.log('Нельзя удалить временное сообщение или сообщение с неверным ID');
        setError('Нельзя удалить отправляемое сообщение');
        closeContextMenu();
        return;
      }

      const response = await fetch(`${API_BASE_URL}/messages/${message.message_id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: currentUser.user_id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка удаления сообщения');
      }

      setMessages(prev => prev.filter(msg => msg.message_id !== message.message_id));
      
    } catch (error) {
      console.error('Ошибка удаления сообщения:', error);
      setError('Ошибка удаления сообщения: ' + error.message);
    } finally {
      closeContextMenu();
    }
  };

  const startEditing = (message) => {
    setEditingMessage(message);
    setEditText(message.content);
    closeContextMenu();
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setEditText('');
  };

  const saveEditedMessage = async () => {
    if (!editText.trim() || !editingMessage) return;

    if (editingMessage.is_sending || typeof editingMessage.message_id !== 'number' || editingMessage.message_id > 2000000000) {
      console.log('Нельзя редактировать временное сообщение');
      setError('Нельзя редактировать отправляемое сообщение');
      cancelEditing();
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/messages/${editingMessage.message_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: editText.trim(),
          user_id: currentUser.user_id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка редактирования сообщения');
      }

      const updatedMessage = await response.json();

      setMessages(prev => prev.map(msg => 
        msg.message_id === editingMessage.message_id 
          ? { ...msg, content: updatedMessage.content, is_edited: true }
          : msg
      ));

      cancelEditing();
      
    } catch (error) {
      console.error('Ошибка редактирования сообщения:', error);
      setError('Ошибка редактирования сообщения: ' + error.message);
    }
  };

  const handleEditKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEditedMessage();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

const sendFile = async (file) => {
  if (!activeChat || !socket || uploadingFile) return;

  try {
    setUploadingFile(true);
    setError('');
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('chat_id', activeChat.chat_id);
    formData.append('user_id', currentUser.user_id.toString());

    // НЕТ временного сообщения - файл появится когда придет с сервера
    
    const response = await fetch(`${API_BASE_URL}/messages/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Ошибка загрузки файла: ${response.status}`);
    }

    // Очищаем выбранный файл
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

  } catch (error) {
    console.error('Ошибка отправки файла:', error);
    setError('Ошибка отправки файла: ' + error.message);
    setTimeout(() => setError(''), 5000);
  } finally {
    setUploadingFile(false);
  }
};

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`Файл слишком большой (максимум ${maxSize / 1024 / 1024}MB)`);
      event.target.value = '';
      return;
    }

    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/mpeg', 'video/ogg', 'video/webm',
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip', 'application/x-rar-compressed',
      'text/plain', 'text/csv'
    ];

    if (!allowedTypes.includes(file.type)) {
      setError('Неподдерживаемый тип файла');
      event.target.value = '';
      return;
    }

    setSelectedFile(file);
    setError('');

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target.result);
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      const videoUrl = URL.createObjectURL(file);
      setFilePreview(videoUrl);
    } else {
      setFilePreview(null);
    }
  };

  const getFileIcon = (fileType, fileName = '') => {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType.startsWith('video/')) return '🎬';
    if (fileType === 'application/pdf') return '📕';
    if (fileType.includes('word') || fileName.toLowerCase().endsWith('.doc') || fileName.toLowerCase().endsWith('.docx')) return '📄';
    if (fileType.includes('excel') || fileName.toLowerCase().endsWith('.xls') || fileName.toLowerCase().endsWith('.xlsx')) return '📊';
    if (fileType.includes('powerpoint') || fileName.toLowerCase().endsWith('.ppt') || fileName.toLowerCase().endsWith('.pptx')) return '📽️';
    if (fileType.includes('zip') || fileType.includes('rar')) return '📦';
    if (fileType.includes('text') || fileName.toLowerCase().endsWith('.txt')) return '📝';
    if (fileType.includes('csv')) return '📋';
    return '📎';
  };

  const getFileTypeText = (fileType, fileName = '') => {
    if (fileType.startsWith('image/')) return 'Изображение';
    if (fileType.startsWith('video/')) return 'Видео';
    if (fileType === 'application/pdf') return 'PDF документ';
    
    const ext = fileName.split('.').pop()?.toLowerCase();
    const extensionMap = {
      'jpg': 'Изображение', 'jpeg': 'Изображение', 'png': 'Изображение', 
      'gif': 'Изображение', 'webp': 'Изображение', 'bmp': 'Изображение',
      'mp4': 'Видео', 'avi': 'Видео', 'mov': 'Видео', 'wmv': 'Видео',
      'doc': 'Документ Word', 'docx': 'Документ Word',
      'xls': 'Таблица Excel', 'xlsx': 'Таблица Excel',
      'ppt': 'Презентация', 'pptx': 'Презентаation',
      'zip': 'Архив', 'rar': 'Архив', '7z': 'Архив',
      'txt': 'Текстовый файл', 'csv': 'CSV файл'
    };
    
    return extensionMap[ext] || 'Файл';
  };

 const sendMessage = async (e) => {
  e.preventDefault();
  
  if (!newMessage.trim() || !activeChat || !socket || sending) return;

  const messageData = {
    chat_id: activeChat.chat_id,
    user_id: currentUser.user_id,
    content: newMessage.trim(),
    message_type: 'text'
  };

  try {
    setSending(true);
    setError('');
    
    // Очищаем поле ввода сразу для лучшего UX
    setNewMessage('');

    
    if (messageInputRef.current) {
      messageInputRef.current.focus();
    }

    // Отправляем через WebSocket - сообщение появится когда придет с сервера
    socket.emit('send_message', messageData);
    
  } catch (error) {
    console.error('Ошибка отправки:', error);
    setError('Ошибка отправки сообщения');
  } finally {
    setSending(false);
  }
};



  const confirmFileSend = () => {
    if (selectedFile) {
      sendFile(selectedFile);
    }
  };

  const cancelFileSend = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Сегодня';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Вчера';
    } else {
      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short'
      });
    }
  };

  const getOtherParticipants = (chat) => {
    return chat.participant_names?.split(',')
      .filter(name => name.trim() !== currentUser.name)
      .join(', ') || 'Пользователь';
  };

  // Функция для получения ID другого участника чата
  const getOtherParticipantId = (chat) => {
    if (!chat || !chat.participant_ids) return null;
    
    const participantIds = chat.participant_ids.split(',').map(id => parseInt(id.trim()));
    const otherParticipantId = participantIds.find(id => id !== currentUser.user_id);
    return otherParticipantId;
  };

  const VoiceMessagePlayer = ({ message, currentUser, API_BASE_URL }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef(null);
    const progressRef = useRef(null);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      const updateTime = () => setCurrentTime(audio.currentTime);
      const updateDuration = () => setDuration(audio.duration || 0);
      const handleEnded = () => setIsPlaying(false);
      const handleLoad = () => setDuration(audio.duration || 0);

      audio.addEventListener('timeupdate', updateTime);
      audio.addEventListener('loadedmetadata', updateDuration);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('canplaythrough', handleLoad);

      return () => {
        audio.removeEventListener('timeupdate', updateTime);
        audio.removeEventListener('loadedmetadata', updateDuration);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('canplaythrough', handleLoad);
      };
    }, []);

    const togglePlayPause = () => {
      const audio = audioRef.current;
      if (!audio) return;

      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch(console.error);
      }
      setIsPlaying(!isPlaying);
    };

    const handleProgressClick = (e) => {
      const audio = audioRef.current;
      const progress = progressRef.current;
      if (!audio || !progress) return;

      const rect = progress.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      audio.currentTime = percent * duration;
    };

    const formatTime = (seconds) => {
      if (!seconds || isNaN(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const progressPercent = duration ? (currentTime / duration) * 100 : 0;

    return (
      <div className={`voice-message-player ${isPlaying ? 'playing' : ''}`}>
        <audio
          ref={audioRef}
          src={`${API_BASE_URL}${message.attachment_url}`}
          preload="metadata"
        />
        
        <div className="voice-player-container">
          <div className="voice-controls">
            <button 
              className="play-pause-btn"
              onClick={togglePlayPause}
              title={isPlaying ? 'Пауза' : 'Воспроизвести'}
            >
              {isPlaying ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"/>
                  <rect x="14" y="4" width="4" height="16"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            <div 
              ref={progressRef}
              className="voice-progress"
              onClick={handleProgressClick}
            >
              <div 
                className="progress-bar"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="voice-time">
            <span className="current-time">{formatTime(currentTime)}</span>
            <span className="duration">{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderMessageContent = (message) => {
    switch (message.message_type) {
      case 'voice':
        return (
          <VoiceMessagePlayer 
            message={message}
            currentUser={currentUser}
            API_BASE_URL={API_BASE_URL}
          />
        );
        
      case 'video':
        return (
          <div className="message-media">
            <video 
              controls 
              className="message-video"
              poster={message.video_thumbnail ? `${API_BASE_URL}${message.video_thumbnail}` : undefined}
            >
              <source src={`${API_BASE_URL}${message.attachment_url}`} type="video/mp4" />
              Ваш браузер не поддерживает видео.
            </video>
          </div>
        );
      
      case 'file':
      case 'image':
        return (
          <div className="message-media">
            <img 
              src={`${API_BASE_URL}${message.attachment_url}`} 
              alt={message.original_filename || 'Изображение'}
              className="message-image"
              onClick={() => window.open(`${API_BASE_URL}${message.attachment_url}`, '_blank')}
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = document.createElement('div');
                fallback.className = 'file-fallback';
                fallback.textContent = '🖼️ ' + (message.original_filename || 'Изображение');
                e.target.parentNode.appendChild(fallback);
              }}
            />
          </div>
        );
        
      default:
        return <div className="message-text">{message.content}</div>;
    }
  };

  const groupMessagesByDate = (messages) => {
    const groups = [];
    let currentDate = null;

    messages.forEach(message => {
      const messageDate = new Date(message.created_at).toDateString();
      
      if (messageDate !== currentDate) {
        currentDate = messageDate;
        groups.push({
          type: 'date',
          date: message.created_at,
          id: `date-${messageDate}`
        });
      }
      
      groups.push({
        type: 'message',
        ...message
      });
    });

    return groups;
  };

  const messageGroups = groupMessagesByDate(messages);

  if (!currentUser) {
    return (
      <div className="messenger">
        <div className="auth-warning">
          <h3>Войдите в систему для использования мессенджера</h3>
        </div>
      </div>
    );
  }

  if (!activeChat) {
    return (
      <div className="messenger">
        <div className="loading">Загрузка чата...</div>
      </div>
    );
  }

  // Получаем ID другого участника для аватара в заголовке
  const otherParticipantId = getOtherParticipantId(activeChat);
  const headerAvatar = getUserAvatar(otherParticipantId);
  const otherParticipantName = getOtherParticipants(activeChat);

  return (
    <div className="messenger">
      <div className="chat-header">
        <button className="back-button" onClick={handleBackToChats}>
          ← Назад к чатам
        </button>
        
        <div className="chat-header-info">
          <div className="chat-avatar">
            {headerAvatar ? (
              <img 
                src={headerAvatar} 
                alt="Аватар" 
                className="chat-avatar-image"
                onError={(e) => {
                  e.target.style.display = 'none';
                  const fallback = e.target.nextSibling;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <div 
              className="chat-avatar-fallback"
              style={{ display: headerAvatar ? 'none' : 'flex' }}
            >
              {getUserInitials(otherParticipantName)}
            </div>
          </div>
          <div className="chat-user-info">
            <h3>{otherParticipantName}</h3>
            <span className="online-status">
              {onlineUsers.has(otherParticipantId?.toString()) ? 'В сети' : 'Не в сети'}
            </span>
          </div>
        </div>
      </div>

      <div className="messages-container" ref={messagesContainerRef}>
        {loading && messages.length === 0 ? (
          <div className="loading">Загрузка сообщений...</div>
        ) : messages.length === 0 ? (
          <div className="no-messages">
            <p>Нет сообщений</p>
            <span>Начните общение первым!</span>
          </div>
        ) : (
          <div className="messages-list">
            {messageGroups.map(item => {
              if (item.type === 'date') {
                return (
                  <div key={item.id} className="date-divider">
                    <span>{formatDate(item.date)}</span>
                  </div>
                );
              }
              
              const messageAvatar = getUserAvatar(item.user_id, item.user_name);
              
              return (
                <div 
                  key={item.message_id}
                  className={`message ${item.is_own ? 'own' : 'other'} ${item.is_sending ? 'sending' : ''}`}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  {!item.is_own && (
                    <div className="message-avatar">
                      {messageAvatar ? (
                        <img 
                          src={messageAvatar} 
                          alt={item.user_name} 
                          className="message-avatar-image"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            const fallback = e.target.nextSibling;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className="message-avatar-fallback"
                        style={{ display: messageAvatar ? 'none' : 'flex' }}
                      >
                        {getUserInitials(item.user_name)}
                      </div>
                    </div>
                  )}
                  
                  <div className="message-content-wrapper">
                    {!item.is_own && (
                      <div className="message-sender">
                        {item.user_name}
                      </div>
                    )}
                    
                    <div className="message-content">
                      {editingMessage?.message_id === item.message_id ? (
                        <div className="message-edit">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={handleEditKeyPress}
                            className="edit-textarea"
                            autoFocus
                            rows={Math.min(5, Math.max(1, editText.split('\n').length))}
                          />
                          <div className="edit-actions">
                            <button onClick={saveEditedMessage} className="save-edit-btn">
                              Сохранить
                            </button>
                            <button onClick={cancelEditing} className="cancel-edit-btn">
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {renderMessageContent(item)}
                          <div className="message-time">
                            {formatTime(item.created_at)}
                            {item.is_edited && <span className="edited-indicator"> (изменено)</span>}
                            {item.is_sending && <span className="sending-indicator">...</span>}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Остальной код формы отправки сообщений остается без изменений */}
      <form className="message-input-form" onSubmit={sendMessage}>
        {selectedFile && (
          <div className="file-preview">
            <div className="file-preview-content">
              {filePreview ? (
                filePreview.startsWith('data:image') ? (
                  <img src={filePreview} alt="Preview" className="file-preview-image" />
                ) : filePreview.startsWith('blob:') ? (
                  <video src={filePreview} className="file-preview-video" controls />
                ) : null
              ) : (
                <div className="file-preview-icon">
                  {getFileIcon(selectedFile.type, selectedFile.name)}
                </div>
              )}
              <div className="file-preview-info">
                <div className="file-name">{selectedFile.name}</div>
                <div className="file-type">{getFileTypeText(selectedFile.type, selectedFile.name)}</div>
                <div className="file-size">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            </div>
            <div className="file-preview-actions">
              <button 
                type="button" 
                onClick={confirmFileSend}
                disabled={uploadingFile}
                className="send-file-btn"
              >
                {uploadingFile ? 'Отправка...' : 'Отправить'}
              </button>
              <button 
                type="button" 
                onClick={cancelFileSend}
                disabled={uploadingFile}
                className="cancel-file-btn"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        <div className="input-container">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.rar"
            style={{ display: 'none' }}
          />
          
          <button 
            type="button"
            className="attach-file-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Прикрепить файл"
            disabled={uploadingFile || sending || selectedFile}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
            </svg>
          </button>

          <button 
            type="button"
            className="voice-record-btn"
            onClick={() => setShowVoiceRecorder(true)}
            title="Записать голосовое сообщение"
            disabled={sending || uploadingFile || selectedFile}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </button>

          <input
            ref={messageInputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Написать сообщение..."
            className="message-input"
            disabled={sending || uploadingFile || selectedFile}
          />

          <button 
            type="submit" 
            className={`send-button ${sending ? 'sending' : ''}`}
            disabled={(!newMessage.trim() && !selectedFile) || sending || uploadingFile}
            title="Отправить сообщение"
          >
            {sending ? (
              <div className="spinner"></div>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            )}
          </button>
        </div>
      </form>

      {/* Контекстное меню для сообщений */}
      {contextMenu && (
        <div 
          className="context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => startEditing(contextMenu.message)}>
            ✏️ Редактировать
          </div>
          <div className="context-menu-item delete" onClick={() => deleteMessage(contextMenu.message)}>
            🗑️ Удалить
          </div>
        </div>
      )}

      {showVoiceRecorder && (
        <VoiceRecorder
          chatId={activeChat?.chat_id}
          userId={currentUser.user_id}
          onSendVoice={(message) => {
            setMessages(prev => [...prev, { 
              ...message, 
              is_own: true 
            }]);
            setShowVoiceRecorder(false);
          }}
          onClose={() => setShowVoiceRecorder(false)}
        />
      )}

      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}
    </div>
  );
};

export default Messenger;