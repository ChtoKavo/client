// components/Feed.jsx
import React, { useState, useEffect } from 'react';
import './Feed.css';

const Feed = ({ currentUser, socket }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newPost, setNewPost] = useState({ content: '', images: [] });
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [error, setError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
//попа
  const API_BASE_URL = 'http://151.241.228.247:5001';

  useEffect(() => {
    if (currentUser) {
      loadPosts();
    }
  }, [currentUser]);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        setLoading(true);
        const response = await fetch(`http://151.241.228.247:5001/api/posts?user_id=${currentUser.user_id}`);
        if (response.ok) {
          const data = await response.json();
          setPosts(data);
        } else {
          console.error('Failed to fetch posts');
        }
      } catch (error) {
        console.error('Error loading posts:', error);
      } finally {
        setLoading(false);
      }
    };

    if (currentUser?.user_id) {
      fetchPosts();
    }
  }, [currentUser?.user_id]);

  useEffect(() => {
    if (socket) {
      console.log('Socket connected in Feed component:', socket.connected);
      setSocketConnected(socket.connected);

      socket.on('connect', () => {
        console.log('Socket connected in Feed');
        setSocketConnected(true);
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected in Feed');
        setSocketConnected(false);
      });

      socket.on('post_liked', handlePostLiked);
      socket.on('post_unliked', handlePostUnliked);
      socket.on('like_error', handleLikeError);
      
      return () => {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('post_liked', handlePostLiked);
        socket.off('post_unliked', handlePostUnliked);
        socket.off('like_error', handleLikeError);
      };
    }
  }, [socket]);

  const loadPosts = async () => {
    try {
      setLoading(true);
      setError('');
      
      const url = new URL(`${API_BASE_URL}/api/posts`);
      if (currentUser && currentUser.user_id) {
        url.searchParams.append('user_id', currentUser.user_id.toString());
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Ошибка загрузки постов: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        setPosts(data);
      } else {
        console.error('Полученные данные не являются массивом:', data);
        setPosts([]);
        setError('Ошибка формата данных');
      }
    } catch (error) {
      console.error('Ошибка загрузки постов:', error);
      setError('Не удалось загрузить посты');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePostLiked = (data) => {
    console.log('Post liked:', data);
    setPosts(prev => prev.map(post => {
      if (post.post_id === data.post_id) {
        return {
          ...post,
          is_liked: true,
          likes_count: (post.likes_count || 0) + 1
        };
      }
      return post;
    }));
  };

  const handlePostUnliked = (data) => {
    console.log('Post unliked:', data);
    setPosts(prev => prev.map(post => {
      if (post.post_id === data.post_id) {
        return {
          ...post,
          is_liked: false,
          likes_count: Math.max(0, (post.likes_count || 1) - 1)
        };
      }
      return post;
    }));
  };

  const handleLikeError = (errorData) => {
    console.error('Like error:', errorData);
    setError(errorData.error || 'Ошибка при лайке');
    loadPosts();
  };

  const createPost = async (e) => {
    e.preventDefault();
    if (!newPost.content.trim()) {
      setError('Введите текст поста');
      return;
    }

    try {
      setError('');
      const formData = new FormData();
      formData.append('user_id', currentUser.user_id.toString());
      formData.append('title', newPost.content.substring(0, 100));
      formData.append('content', newPost.content);
      formData.append('is_public', '1');
      formData.append('category_id', '1');
      
      // Добавляем все изображения с одним и тем же именем поля
      newPost.images.forEach((image) => {
        formData.append('media', image); // Все файлы с одним именем поля 'media'
      });

      const response = await fetch(`${API_BASE_URL}/api/posts`, {
        method: 'POST',
        body: formData // НЕ добавляем Content-Type заголовок
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка создания поста');
      }

      const post = await response.json();
      
      const postWithLike = { 
        ...post, 
        is_liked: false, 
        likes_count: 0, 
        comments_count: 0,
        images: post.images || [] // убедимся, что images есть
      };
      
      setPosts(prev => [postWithLike, ...prev]);
      setNewPost({ content: '', images: [] });
      setShowCreatePost(false);
      setError('');
      
    } catch (error) {
      console.error('Ошибка создания поста:', error);
      setError(error.message || 'Не удалось создать пост');
    }
  };

  const handleLike = async (postId) => {
    console.log('Like clicked for post:', postId);
    console.log('Socket connected:', socketConnected);
    console.log('Socket object:', socket);

    if (!socket || !socketConnected) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/posts/${postId}/like`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: currentUser.user_id
          })
        });

        if (response.ok) {
          const result = await response.json();
          setPosts(prev => prev.map(post => {
            if (post.post_id === postId) {
              return {
                ...post,
                is_liked: result.is_liked,
                likes_count: result.likes_count
              };
            }
            return post;
          }));
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Ошибка лайка');
        }
      } catch (error) {
        console.error('Ошибка лайка через REST:', error);
        setError(`Ошибка: ${error.message}`);
        loadPosts();
      }
      return;
    }

    try {
      setPosts(prev => prev.map(post => {
        if (post.post_id === postId) {
          const wasLiked = post.is_liked;
          return {
            ...post,
            is_liked: !wasLiked,
            likes_count: wasLiked ? 
              Math.max(0, (post.likes_count || 1) - 1) : 
              (post.likes_count || 0) + 1
          };
        }
        return post;
      }));

      socket.emit('like_post', {
        post_id: postId,
        user_id: currentUser.user_id
      });

    } catch (error) {
      console.error('Ошибка отправки лайка через WebSocket:', error);
      setError('Не удалось поставить лайк');
      loadPosts();
    }
  };

  const handleImagesChange = (e) => {
    const files = Array.from(e.target.files);
    
    if (files.length === 0) return;

    // Проверяем общее количество изображений
    const totalImages = newPost.images.length + files.length;
    if (totalImages > 5) {
      setError(`Можно загрузить не более 5 изображений. У вас уже ${newPost.images.length}, пытаетесь добавить еще ${files.length}`);
      e.target.value = '';
      return;
    }

    // Проверяем каждый файл
    const validFiles = [];
    const errors = [];

    files.forEach(file => {
      // Проверяем размер файла (максимум 5MB)
      if (file.size > 5 * 1024 * 1024) {
        errors.push(`Файл "${file.name}" слишком большой (максимум 5MB)`);
        return;
      }
      
      // Проверяем тип файла
      if (!file.type.startsWith('image/')) {
        errors.push(`Файл "${file.name}" не является изображением`);
        return;
      }
      
      validFiles.push(file);
    });

    if (errors.length > 0) {
      setError(errors.join(', '));
    }

    if (validFiles.length > 0) {
      setNewPost(prev => ({ 
        ...prev, 
        images: [...prev.images, ...validFiles] 
      }));
      setError('');
    }

    // Очищаем input
    e.target.value = '';
  };

  const removeImage = (indexToRemove) => {
    setNewPost(prev => ({
      ...prev,
      images: prev.images.filter((_, index) => index !== indexToRemove)
    }));
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays < 7) return `${diffDays} д назад`;
    
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="feed">
      <div className="feed-header">
        <div className="header-actions">
         
          <button 
            className="create-post-btn"
            onClick={() => setShowCreatePost(true)}
          >
            <span className="btn-icon">✏️</span>
            Написать пост
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {showCreatePost && (
        <div className="create-post-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Создать пост</h3>
              <button 
                className="close-modal"
                onClick={() => {
                  setShowCreatePost(false);
                  setNewPost({ content: '', images: [] });
                  setError('');
                }}
              >
                ×
              </button>
            </div>
            
            <form onSubmit={createPost} className="post-form">
              <div className="form-content">
                <textarea
                  value={newPost.content}
                  onChange={(e) => setNewPost({...newPost, content: e.target.value})}
                  placeholder="Что у вас нового?"
                  rows="4"
                  maxLength="1000"
                  className="post-textarea"
                />
                
                <div className="char-count">
                  {newPost.content.length}/1000
                </div>

                {newPost.images.length > 0 && (
                  <div className="images-preview">
                    <div className="images-grid">
                      {newPost.images.map((image, index) => (
                        <div key={index} className="image-preview-item">
                          <img 
                            src={URL.createObjectURL(image)} 
                            alt={`Preview ${index + 1}`} 
                            className="preview-image"
                          />
                          <button 
                            type="button" 
                            className="remove-image-btn"
                            onClick={() => removeImage(index)}
                          >
                            ×
                          </button>
                          <div className="image-number">{index + 1}</div>
                        </div>
                      ))}
                    </div>
                    <div className="images-count">
                      {newPost.images.length} из 5 изображений
                    </div>
                  </div>
                )}
              </div>

              <div className="post-actions">
                <div className="action-buttons">
                  <label htmlFor="images-upload" className="file-upload-btn">
                    <span className="upload-icon">📷</span>
                    Фото ({newPost.images.length}/5)
                  </label>
                  <input
                    id="images-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImagesChange}
                    style={{ display: 'none' }}
                    disabled={newPost.images.length >= 5}
                  />
                </div>
                
                <div className="modal-buttons">
                  <button 
                    type="button" 
                    className="cancel-btn"
                    onClick={() => {
                      setShowCreatePost(false);
                      setNewPost({ content: '', images: [] });
                      setError('');
                    }}
                  >
                    Отмена
                  </button>
                  <button 
                    type="submit" 
                    className="submit-btn"
                    disabled={!newPost.content.trim()}
                  >
                    Опубликовать
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="posts-list">
        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            Загрузка постов...
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📰</div>
            <h3>Пока нет постов</h3>
            <p>Будьте первым, кто поделится новостью!</p>
            <button 
              className="create-first-post-btn"
              onClick={() => setShowCreatePost(true)}
            >
              Создать первый пост
            </button>
          </div>
        ) : (
          posts.map(post => (
            <PostItem 
              key={post.post_id} 
              post={post} 
              currentUser={currentUser}
              onLike={handleLike}
              formatDate={formatDate}
              socketConnected={socketConnected}
              API_BASE_URL={API_BASE_URL}
            />
          ))
        )}
      </div>
    </div>
  );
};

const PostItem = ({ post, currentUser, onLike, formatDate, socketConnected, API_BASE_URL }) => {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [authorAvatar, setAuthorAvatar] = useState(null);

  // Загружаем аватарку автора поста
  useEffect(() => {
    const loadAuthorAvatar = async () => {
      try {
        if (post.user_id) {
          const response = await fetch(`${API_BASE_URL}/api/users/${post.user_id}/profile`);
          if (response.ok) {
            const userData = await response.json();
            if (userData.avatar_url) {
              setAuthorAvatar(userData.avatar_url);
            }
          }
        }
      } catch (error) {
        console.error('Ошибка загрузки аватарки автора:', error);
      }
    };

    loadAuthorAvatar();
  }, [post.user_id, API_BASE_URL]);

  const loadComments = async () => {
    if (comments.length > 0 && showComments) {
      setShowComments(false);
      return;
    }

    try {
      setLoadingComments(true);
      console.log('Loading comments for post:', post.post_id);
      
      const response = await fetch(
        `${API_BASE_URL}/api/posts/${post.post_id}/comments?user_id=${currentUser.user_id}`
      );
      
      if (!response.ok) {
        throw new Error('Ошибка загрузки комментариев');
      }
      
      const data = await response.json();
      console.log('Comments loaded:', data);
      
      setComments(Array.isArray(data) ? data : []);
      setShowComments(true);
    } catch (error) {
      console.error('Ошибка загрузки комментариев:', error);
      alert('Не удалось загрузить комментарии: ' + error.message);
    } finally {
      setLoadingComments(false);
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;

    try {
      console.log('Adding comment to post:', post.post_id, 'Content:', newComment);
      
      const response = await fetch(`${API_BASE_URL}/api/posts/${post.post_id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: currentUser.user_id,
          content: newComment
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка добавления комментария');
      }

      const addedComment = await response.json();
      
      // Обновляем список комментариев
      setComments(prev => [...prev, addedComment]);
      setNewComment('');
      
      // Обновляем счетчик комментариев в посте
      if (post.comments_count !== undefined) {
        post.comments_count += 1;
      }
      
      console.log('Comment added successfully:', addedComment);
      
    } catch (error) {
      console.error('Ошибка добавления комментария:', error);
      alert('Не удалось добавить комментарий: ' + error.message);
    }
  };

  const handleCommentKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addComment();
    }
  };

  // Функция для отображения галереи изображений
  const renderPostImages = () => {
    if (!post.image_url && !post.images) return null;

    let images = [];
    
    // Поддержка как старого формата (одно изображение), так и нового (массив)
    if (post.images && Array.isArray(post.images)) {
      images = post.images;
    } else if (post.image_url) {
      images = [post.image_url];
    }

    if (images.length === 0) return null;

    const getGridClass = (count) => {
      if (count === 1) return 'grid-1';
      if (count === 2) return 'grid-2';
      if (count === 3) return 'grid-3';
      if (count >= 4) return 'grid-4';
    };

    return (
      <div className={`post-images-gallery ${getGridClass(images.length)}`}>
        {images.slice(0, 4).map((imageUrl, index) => (
          <div key={index} className="gallery-image-item">
            <img 
              src={`${API_BASE_URL}${imageUrl}`} 
              alt={`Post image ${index + 1}`} 
              className="gallery-image"
              onError={(e) => {
                console.error('Error loading image:', imageUrl);
                e.target.style.display = 'none';
              }}
            />
            {images.length > 4 && index === 3 && (
              <div className="image-overlay">
                +{images.length - 4}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Функция для отображения аватарки
  const renderAvatar = () => {
    if (authorAvatar) {
      return (
        <img 
          src={`${API_BASE_URL}${authorAvatar}`} 
          alt={`${post.author_name || 'User'} avatar`}
          className="author-avatar-img"
          onError={(e) => {
            // Если изображение не загружается, показываем fallback
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
      );
    }
    
    // Fallback - первая буква имени
    return (
      <div className="author-avatar-fallback">
        {post.author_name?.charAt(0).toUpperCase() || 'U'}
      </div>
    );
  };

  return (
    <div className="post-item">
      <div className="post-header">
        <div className="post-author">
          <div className="author-avatar">
            {renderAvatar()}
          </div>
          <div className="author-info">
            <strong>{post.author_name || 'Неизвестный пользователь'}</strong>
            <span>{formatDate(post.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="post-content">
        <p>{post.content}</p>
        {renderPostImages()}
      </div>

      <div className="post-actions">
        <button 
          className={`like-btn ${post.is_liked ? 'liked' : ''}`}
          onClick={() => onLike(post.post_id)}
          title={socketConnected ? '' : 'Используется REST API'}
        >
          {post.is_liked ? '❤️' : '🤍'}
          <span>{post.likes_count || 0}</span>
        </button>
        <button 
          className="comment-btn"
          onClick={loadComments}
          disabled={loadingComments}
          title="Комментарии"
        >
          💬
          <span>{loadingComments ? '…' : (post.comments_count || 0)}</span>
        </button>
        <button className="share-btn" title="Поделиться">
          🔄
        </button>
      </div>

      {showComments && (
        <div className="post-comments">
          <div className="add-comment">
            <div className="comment-avatar">
              {currentUser.name?.charAt(0).toUpperCase()}
            </div>
            <div className="comment-input-container">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyPress={handleCommentKeyPress}
                placeholder="Напишите комментарий..."
                className="comment-input"
              />
              <button 
                onClick={addComment}
                disabled={!newComment.trim()}
                className="send-comment-btn"
              >
                Отправить
              </button>
            </div>
          </div>
          
          <div className="comments-list">
            {comments.length === 0 ? (
              <div className="no-comments">
                <p>Пока нет комментариев</p>
              </div>
            ) : (
              comments.map(comment => (
                <div key={comment.comment_id} className="comment">
                  <div className="comment-avatar small">
                    {comment.user_name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="comment-content">
                    <div className="comment-header">
                      <strong>{comment.user_name}</strong>
                    </div>
                    <p className="comment-text">{comment.content}</p>
                    <span className="comment-time">
                      {formatDate(comment.created_at)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Feed;