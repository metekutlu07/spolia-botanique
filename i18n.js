(function () {
  const cache = new Map()
  let _autoplayObserver = null

  function normalizeLang(lang) {
    return lang === 'fr' ? 'fr' : 'en'
  }

  function getLanguage() {
    return normalizeLang(localStorage.getItem('language') || 'en')
  }

  function setLanguage(lang) {
    const normalized = normalizeLang(lang)
    localStorage.setItem('language', normalized)
    document.documentElement.lang = normalized
    return normalized
  }

  function pageNameFromPath(pathname = window.location.pathname) {
    const raw = pathname.split('/').pop() || 'index.html'
    const file = raw === '' ? 'index.html' : raw
    return file.replace(/\.html$/, '') || 'index'
  }

  async function loadCatalog(lang) {
    const normalized = normalizeLang(lang)
    if (!cache.has(normalized)) {
      cache.set(
        normalized,
        fetch(`locales/${normalized}.json`).then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to load locale: ${normalized}`)
          }
          return res.json()
        })
      )
    }
    return cache.get(normalized)
  }

  function applyMap(root, map) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n')
      if (key && Object.prototype.hasOwnProperty.call(map, key)) {
        el.innerHTML = map[key]
      }
    })
  }

  function updateLangButtons(lang) {
    document.querySelectorAll('.lang-btn[data-lang]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === lang)
    })
    document.querySelectorAll('.nav-lang-btn').forEach((btn) => {
      btn.textContent = lang.toUpperCase()
      btn.setAttribute('title', lang === 'fr' ? 'Passer en anglais' : 'Switch to French')
      btn.setAttribute('aria-label', btn.getAttribute('title'))
    })
    document.querySelectorAll('.landing-lang-btn').forEach((btn) => {
      btn.textContent = lang.toUpperCase()
      btn.setAttribute('title', lang === 'fr' ? 'Passer en anglais' : 'Switch to French')
      btn.setAttribute('aria-label', btn.getAttribute('title'))
    })
  }

  async function applyTranslations(root = document, pageName = pageNameFromPath()) {
    const lang = getLanguage()
    document.documentElement.lang = lang

    const catalog = await loadCatalog(lang)
    const pageMap = catalog.pages?.[pageName] || {}
    const merged = { ...(catalog.global || {}), ...pageMap }

    applyMap(root, merged)

    if (catalog.titles?.[pageName]) {
      document.title = catalog.titles[pageName]
    }

    updateLangButtons(lang)
    return { lang, pageName, catalog }
  }

  async function initPage(pageName = pageNameFromPath(), root = document) {
    return applyTranslations(root, pageName)
  }

  function prepareAutoplayVideo(video) {
    if (!video) return () => {}

    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.autoplay = true
    video.preload = 'auto'
    video.setAttribute('muted', '')
    video.setAttribute('autoplay', '')
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.setAttribute('preload', 'auto')

    const tryPlay = () => {
      if (document.visibilityState === 'hidden') return
      const promise = video.play()
      if (promise) promise.catch(() => {})
    }

    if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      video.load()
    }

    return tryPlay
  }

  function disconnectVideoObserver() {
    if (_autoplayObserver) {
      _autoplayObserver.disconnect()
      _autoplayObserver = null
    }
  }

  function initAutoplayVideos(root = document) {
    // Disconnect any previous observer so old-page videos are no longer tracked
    disconnectVideoObserver()

    const videos = [...root.querySelectorAll('video')].filter((video) => video.id !== 'bg-video')

    videos.forEach((video) => {
      if (video.dataset.autoplayReady === '1') return
      video.dataset.autoplayReady = '1'

      // prepareAutoplayVideo sets all required attributes (muted, autoplay, playsinline,
      // preload="auto") and calls load() if the video hasn't started loading yet.
      // We do NOT call the returned tryPlay immediately — the IntersectionObserver does.
      const tryPlay = prepareAutoplayVideo(video)

      // Retry when the browser signals the video has data — only if still in viewport
      ;['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing', 'stalled', 'suspend'].forEach((eventName) => {
        video.addEventListener(eventName, () => {
          if (video.dataset.inView === '1') tryPlay()
        })
      })

      // Resume if the browser pauses the video while it is in view.
      // (We set inView='0' before calling pause() ourselves, so this only
      // triggers on browser-initiated pauses.)
      video.addEventListener('pause', () => {
        if (!video.ended && video.dataset.inView === '1') tryPlay()
      })
    })

    // Only play the video that is actually visible; pause everything else.
    // This prevents multiple simultaneous decode pipelines on heavy pages.
    _autoplayObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target
        if (entry.isIntersecting) {
          video.dataset.inView = '1'
          video.play().catch(() => {})
        } else {
          video.dataset.inView = '0'
          // Only pause if actually playing to avoid disrupting preload on
          // off-screen videos that haven't started yet
          if (!video.paused) video.pause()
        }
      })
    }, { rootMargin: '0px', threshold: 0.1 })

    videos.forEach((video) => _autoplayObserver.observe(video))

    const replayAll = () => {
      videos.forEach((video) => {
        if (video.dataset.inView === '1') video.play().catch(() => {})
      })
    }

    if (!document.documentElement.dataset.videoAutoplayListenersReady) {
      document.documentElement.dataset.videoAutoplayListenersReady = '1'
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') replayAll()
      })
      window.addEventListener('pageshow', replayAll)
      window.addEventListener('focus', replayAll)
      window.addEventListener('pointerdown', replayAll, { passive: true })
    }
  }

  function initResponsiveNav() {
    const mobileNavQuery = window.matchMedia('(max-width: 1240px)')

    document.querySelectorAll('.top-nav, #main-nav').forEach((nav) => {
      if (nav.dataset.responsiveNavReady === '1') return

      const links = nav.querySelector('.nav-links')
      if (!links) return
      const controls = nav.querySelector('.nav-controls')

      nav.classList.remove('nav-mobile-open')
      nav.dataset.responsiveNavReady = '1'

      const toggle = document.createElement('button')
      toggle.className = 'nav-menu-toggle'
      toggle.type = 'button'
      toggle.setAttribute('aria-label', 'Open navigation menu')
      toggle.setAttribute('aria-expanded', 'false')
      toggle.textContent = '⚘'
      let closeTimer = null

      function setMenuOpen(open) {
        if (closeTimer) {
          clearTimeout(closeTimer)
          closeTimer = null
        }

        if (open) {
          nav.classList.remove('nav-mobile-closing')
          nav.classList.add('nav-mobile-open')
        } else if (nav.classList.contains('nav-mobile-open')) {
          nav.classList.add('nav-mobile-closing')
          nav.classList.remove('nav-mobile-open')
          closeTimer = setTimeout(() => {
            nav.classList.remove('nav-mobile-closing')
            closeTimer = null
          }, 320)
        } else {
          nav.classList.remove('nav-mobile-closing')
        }

        toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
        toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu')
        toggle.textContent = open ? '×' : '⚘'
      }

      toggle.addEventListener('click', () => {
        setMenuOpen(!nav.classList.contains('nav-mobile-open'))
      })

      links.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', (event) => {
          if (mobileNavQuery.matches && nav.classList.contains('nav-mobile-open')) {
            const href = link.getAttribute('href')
            if (href && href !== '#') {
              event.preventDefault()
              setMenuOpen(false)
              setTimeout(() => {
                window.location.href = href
              }, 330)
              return
            }
          }
          setMenuOpen(false)
        })
      })

      const panel = document.createElement('div')
      panel.className = 'nav-mobile-panel'
      nav.appendChild(toggle)

      function moveIntoPanel() {
        if (links.parentElement === panel) return
        nav.insertBefore(panel, toggle)
        panel.appendChild(links)
        if (controls) panel.appendChild(controls)
      }

      function moveOutOfPanel() {
        if (links.parentElement !== panel) return
        nav.insertBefore(links, toggle)
        if (controls) nav.insertBefore(controls, toggle)
        if (panel.parentElement === nav) panel.remove()
      }

      function syncNavStructure() {
        setMenuOpen(false)
        if (mobileNavQuery.matches) {
          moveIntoPanel()
        } else {
          moveOutOfPanel()
        }
      }

      syncNavStructure()
      mobileNavQuery.addEventListener('change', syncNavStructure)
    })
  }

  window.SpoliaI18n = {
    getLanguage,
    setLanguage,
    loadCatalog,
    applyTranslations,
    initPage,
    initAutoplayVideos,
    disconnectVideoObserver,
    prepareAutoplayVideo,
    initResponsiveNav,
    pageNameFromPath,
  }

  document.addEventListener('DOMContentLoaded', () => {
    initResponsiveNav()
    initAutoplayVideos(document)

    const pageName = pageNameFromPath()
    if (pageName !== 'index') {
      initPage(pageName).catch(() => {})
    }
  })
})()
