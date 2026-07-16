// Aura - Premium Cloud-Synced Expense Tracker Core JavaScript
// State Management, Firebase Integration, Auth, and Firestore Syncing

(function () {
  'use strict';

  // --- Constants & Config ---
  const CURRENCIES = {
    USD: { symbol: '$', locale: 'en-US' },
    INR: { symbol: '₹', locale: 'en-IN' },
    EUR: { symbol: '€', locale: 'de-DE' },
    GBP: { symbol: '£', locale: 'en-GB' },
    JPY: { symbol: '¥', locale: 'ja-JP' }
  };

  const DEFAULT_CATEGORIES = {
    income: ['Salary', 'Freelance', 'Investments', 'Gifts', 'Other'],
    expense: [
      'Food & Dining',
      'Shopping',
      'Rent & Bills',
      'Entertainment',
      'Transportation',
      'Healthcare',
      'Education',
      'Travel',
      'Other'
    ]
  };

  const CATEGORY_COLORS = {
    'Salary': { color: '#00ff87', hue: 150 },
    'Freelance': { color: '#00e5ff', hue: 190 },
    'Investments': { color: '#ffd600', hue: 50 },
    'Gifts': { color: '#ff00ab', hue: 320 },
    'Food & Dining': { color: '#ff9100', hue: 35 },
    'Shopping': { color: '#ff0055', hue: 345 },
    'Rent & Bills': { color: '#7c4dff', hue: 260 },
    'Entertainment': { color: '#e040fb', hue: 290 },
    'Transportation': { color: '#2979ff', hue: 220 },
    'Healthcare': { color: '#00e676', hue: 145 },
    'Education': { color: '#651fff', hue: 255 },
    'Travel': { color: '#18ffff', hue: 180 },
    'Other': { color: '#90a4ae', hue: 200 }
  };

  function getCategoryStyle(cat) {
    if (CATEGORY_COLORS[cat]) {
      return CATEGORY_COLORS[cat];
    }
    let hash = 0;
    for (let i = 0; i < cat.length; i++) {
      hash = cat.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return {
      color: `hsl(${hue}, 70%, 55%)`,
      hue: hue
    };
  }

  // --- Core Application State ---
  let state = {
    profile: {
      name: 'Saurabh Pandey',
      currency: 'INR',
      themeHue: 250,
      themeMode: 'dark'
    },
    transactions: [],
    budgets: {},
    goals: [],
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES))
  };

  let currentUser = null;
  let authMode = 'login'; // 'login' or 'register'
  
  // Firebase global handlers
  let authInstance = null;
  let firestoreInstance = null;

  // Chart instances
  let charts = {
    flow: null,
    category: null,
    reportsAnalysis: null,
    reportsBreakdown: null
  };

  // Transactions Pagination State
  let txPagination = {
    currentPage: 1,
    itemsPerPage: 10,
    filteredList: []
  };

  // --- Dynamic UI Toggle Switches ---
  function showViewContainer(viewId) {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'none';
    
    document.getElementById(viewId).style.display = 'flex';
  }

  // --- Firebase Bootstrapper ---
  function bootFirebaseApp() {
    try {
      if (firebase.apps.length === 0) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      authInstance = firebase.auth();
      firestoreInstance = firebase.firestore();
      
      // Enable Firestore offline persistence for top-tier stability
      firestoreInstance.enablePersistence().catch(err => {
        console.warn('Firestore persistence warning:', err.code);
      });

      // Bind Auth listener
      bindFirebaseAuthListener();
      
      // Transition to auth screen (handled by listener)
    } catch (e) {
      console.error('Firebase initialization crash:', e);
    }
  }

  // --- Authentication Bindings & Handlers ---
  function bindFirebaseAuthListener() {
    authInstance.onAuthStateChanged(user => {
      if (user) {
        // User logged in
        currentUser = user;
        showNotification(`Welcome back, ${user.displayName || user.email}!`, 'success');
        
        // Hide loader/login screens, show app container
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        // Populate profile controls
        updateProfileControlsUI(user);
        
        // Fetch or Seed user profile
        syncUserData(user.uid);
      } else {
        // User logged out
        currentUser = null;
        resetState();
        showViewContainer('auth-container');
      }
    });
  }

  function updateProfileControlsUI(user) {
    const nameEl = document.getElementById('sidebar-username');
    const emailEl = document.getElementById('sidebar-user-email');
    const avatarEl = document.getElementById('sidebar-avatar');

    const displayName = user.displayName || user.email.split('@')[0];
    nameEl.textContent = displayName;
    emailEl.textContent = user.email;

    if (user.photoURL) {
      avatarEl.innerHTML = `<img src="${user.photoURL}" alt="${displayName}">`;
    } else {
      avatarEl.textContent = displayName.charAt(0).toUpperCase();
      avatarEl.innerHTML = displayName.charAt(0).toUpperCase();
    }
  }

  function initAuthFormHandlers() {
    const emailInput = document.getElementById('auth-email-input');
    const passwordInput = document.getElementById('auth-password-input');
    const submitBtn = document.getElementById('auth-submit-btn');
    const googleBtn = document.getElementById('auth-google-btn');
    const errorBox = document.getElementById('auth-error-box');

    // Switch between Login and Register tabs
    const tabLogin = document.getElementById('tab-login-btn');
    const tabRegister = document.getElementById('tab-register-btn');

    tabLogin.addEventListener('click', () => {
      authMode = 'login';
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      document.getElementById('auth-main-title').textContent = 'Welcome to Aura';
      document.getElementById('auth-main-subtitle').textContent = 'Sign in to track your metrics and goals.';
      submitBtn.textContent = 'Log In';
      errorBox.style.display = 'none';
    });

    tabRegister.addEventListener('click', () => {
      authMode = 'register';
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      document.getElementById('auth-main-title').textContent = 'Create Aura Account';
      document.getElementById('auth-main-subtitle').textContent = 'Start syncing your finances to the cloud.';
      submitBtn.textContent = 'Register Account';
      errorBox.style.display = 'none';
    });

    // Form submit listener
    submitBtn.addEventListener('click', () => {
      errorBox.style.display = 'none';
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        showAuthError('Please fill out all fields.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';

      if (authMode === 'login') {
        authInstance.signInWithEmailAndPassword(email, password)
          .catch(err => {
            showAuthError(err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Log In';
          });
      } else {
        authInstance.createUserWithEmailAndPassword(email, password)
          .then((cred) => {
            // Update auth state (triggers listener, which updates databases)
          })
          .catch(err => {
            showAuthError(err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Register Account';
          });
      }
    });

    // Google Popup Sign In
    googleBtn.addEventListener('click', () => {
      errorBox.style.display = 'none';
      const provider = new firebase.auth.GoogleAuthProvider();
      authInstance.signInWithPopup(provider)
        .catch(err => {
          showAuthError(err.message);
        });
    });

    // Sidebar sign-out button
    document.getElementById('sidebar-logout-btn').addEventListener('click', () => {
      authInstance.signOut()
        .then(() => {
          showNotification('Logged out successfully.', 'info');
        });
    });
  }

  function showAuthError(msg) {
    const errorBox = document.getElementById('auth-error-box');
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
  }

  // --- Firestore Syncing Service ---
  
  // High-performance real-time user database syncer
  function syncUserData(userId) {
    const userRef = firestoreInstance.collection('users').doc(userId);
    
    // 1. Fetch Profile Data
    userRef.get().then(doc => {
      if (doc.exists) {
        state.profile = doc.data();
        applyTheme();
      } else {
        // Save initial default profile
        state.profile = {
          name: currentUser.displayName || 'Saurabh Pandey',
          currency: 'INR',
          themeHue: 250,
          themeMode: 'dark'
        };
        userRef.set(state.profile).catch(err => console.error("Error setting profile:", err));
      }

      // 2. Fetch/Create Custom Categories list
      userRef.collection('metadata').doc('categories').get().then(catDoc => {
        if (catDoc.exists) {
          state.categories = catDoc.data();
        } else {
          // Initialize defaults
          state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
          userRef.collection('metadata').doc('categories').set(state.categories).catch(err => console.error("Error setting categories:", err));
        }

        // 3. Fetch Budgets
        userRef.collection('metadata').doc('budgets').get().then(budgDoc => {
          if (budgDoc.exists) {
            state.budgets = budgDoc.data();
          } else {
            state.budgets = {};
            userRef.collection('metadata').doc('budgets').set(state.budgets).catch(err => console.error("Error setting budgets:", err));
          }

          // 4. Fetch Goals
          userRef.collection('goals').get().then(goalsSnapshot => {
            state.goals = [];
            if (!goalsSnapshot.empty) {
              goalsSnapshot.forEach(goalDoc => {
                state.goals.push(goalDoc.data());
              });
            }

            // 5. Fetch Transactions
            userRef.collection('transactions').get().then(txSnapshot => {
              state.transactions = [];
              if (!txSnapshot.empty) {
                txSnapshot.forEach(txDoc => {
                  state.transactions.push(txDoc.data());
                });
              }
              // Finished syncing, boot display!
              triggerViewRender('dashboard');
            }).catch(err => {
              console.error("Error fetching transactions:", err);
              showNotification("Failed to load transactions from cloud.", "error");
              triggerViewRender('dashboard');
            });

          }).catch(err => {
            console.error("Error fetching goals:", err);
            showNotification("Failed to load savings goals.", "error");
          });

        }).catch(err => {
          console.error("Error fetching budgets:", err);
          showNotification("Failed to load budgets.", "error");
        });

      }).catch(err => {
        console.error("Error fetching categories:", err);
        showNotification("Failed to load custom categories.", "error");
      });

    }).catch(err => {
      console.error("Error fetching profile:", err);
      showNotification("Failed to load user profile.", "error");
    });
  }

  function seedDefaultTransactionsToFirestore(userId) {
    const today = new Date();
    const currentYear = today.getFullYear();
    const mockTransactions = [];
    let idCounter = 1;

    function addMock(type, category, amount, description, method, daysAgo) {
      const date = new Date();
      date.setDate(today.getDate() - daysAgo);
      const dateString = date.toISOString().split('T')[0];
      
      mockTransactions.push({
        id: `tx-${idCounter++}`,
        type: type,
        category: category,
        amount: parseFloat(amount),
        description: description,
        method: method,
        date: dateString
      });
    }

    // Previous Month Mocking
    addMock('income', 'Salary', 80000, 'Monthly Salary', 'Bank Transfer', 45);
    addMock('income', 'Freelance', 12000, 'UI/UX Design Consultation', 'UPI / Wallet', 38);
    addMock('expense', 'Rent & Bills', 22000, 'House Rent', 'Bank Transfer', 44);
    addMock('expense', 'Rent & Bills', 2500, 'Electricity Bill', 'UPI / Wallet', 40);
    addMock('expense', 'Food & Dining', 3200, 'Supermarket Groceries', 'Debit Card', 43);
    addMock('expense', 'Food & Dining', 1500, 'Weekend Dineout', 'Credit Card', 41);
    addMock('expense', 'Shopping', 8500, 'Clothing and Apparel', 'Credit Card', 39);
    addMock('expense', 'Transportation', 3500, 'Monthly Fuel', 'Cash', 42);
    addMock('expense', 'Entertainment', 2500, 'Movie & Drinks', 'Credit Card', 37);

    // Current Month Mocking
    addMock('income', 'Salary', 80000, 'Monthly Salary', 'Bank Transfer', 15);
    addMock('income', 'Freelance', 15000, 'Frontend Development Gig', 'Bank Transfer', 8);
    addMock('expense', 'Rent & Bills', 22000, 'House Rent', 'Bank Transfer', 14);
    addMock('expense', 'Rent & Bills', 2800, 'Electricity Bill', 'UPI / Wallet', 10);
    addMock('expense', 'Food & Dining', 4200, 'Aura Organic Groceries', 'Debit Card', 13);
    addMock('expense', 'Food & Dining', 2200, 'Friday Night Restaurant', 'Credit Card', 11);
    addMock('expense', 'Shopping', 4500, 'Wireless Bluetooth Earbuds', 'Credit Card', 12);
    addMock('expense', 'Transportation', 3500, 'Car Fuel Refill', 'Credit Card', 11);
    addMock('expense', 'Entertainment', 1499, 'Netflix & Spotify Annual', 'Credit Card', 10);

    state.transactions = mockTransactions;
    
    // Batch write to Firestore for high performance
    const batch = firestoreInstance.batch();
    const txCollectionRef = firestoreInstance.collection('users').doc(userId).collection('transactions');

    state.transactions.forEach(t => {
      const docRef = txCollectionRef.doc(t.id);
      batch.set(docRef, t);
    });

    batch.commit().then(() => {
      triggerViewRender('dashboard');
    });
  }

  // --- Firestore Write Helpers ---
  function writeTransactionToCloud(tx) {
    if (!currentUser) return;
    firestoreInstance.collection('users').doc(currentUser.uid)
      .collection('transactions').doc(tx.id).set(tx)
      .catch(err => {
        console.error("Cloud Sync Error (writeTransaction):", err);
        showNotification("Failed to sync transaction to cloud.", "error");
      });
  }

  function deleteTransactionFromCloud(txId) {
    if (!currentUser) return;
    firestoreInstance.collection('users').doc(currentUser.uid)
      .collection('transactions').doc(txId).delete()
      .catch(err => {
        console.error("Cloud Sync Error (deleteTransaction):", err);
        showNotification("Failed to delete transaction from cloud.", "error");
      });
  }

  function syncBudgetsToCloud() {
    if (!currentUser) return;
    firestoreInstance.collection('users').doc(currentUser.uid)
      .collection('metadata').doc('budgets').set(state.budgets)
      .catch(err => {
        console.error("Cloud Sync Error (syncBudgets):", err);
        showNotification("Failed to sync budgets to cloud.", "error");
      });
  }

  function writeGoalToCloud(goal) {
    if (!currentUser) return;
    firestoreInstance.collection('users').doc(currentUser.uid)
      .collection('goals').doc(goal.id).set(goal)
      .catch(err => {
        console.error("Cloud Sync Error (writeGoal):", err);
        showNotification("Failed to sync savings goal to cloud.", "error");
      });
  }

  function deleteGoalFromCloud(goalId) {
    if (!currentUser) return;
    firestoreInstance.collection('users').doc(currentUser.uid)
      .collection('goals').doc(goalId).delete()
      .catch(err => {
        console.error("Cloud Sync Error (deleteGoal):", err);
        showNotification("Failed to delete savings goal from cloud.", "error");
      });
  }

  function syncCategoriesToCloud() {
    if (!currentUser) return;
    firestoreInstance.collection('users').doc(currentUser.uid)
      .collection('metadata').doc('categories').set(state.categories)
      .catch(err => {
        console.error("Cloud Sync Error (syncCategories):", err);
        showNotification("Failed to sync custom categories to cloud.", "error");
      });
  }

  // --- Reset Cache on Sign Out ---
  function resetState() {
    state = {
      profile: {
        name: 'Saurabh Pandey',
        currency: 'INR',
        themeHue: 250,
        themeMode: 'dark'
      },
      transactions: [],
      budgets: {},
      goals: [],
      categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES))
    };
    txPagination.currentPage = 1;
    txPagination.filteredList = [];
    
    // Reset inputs
    document.getElementById('auth-email-input').value = '';
    document.getElementById('auth-password-input').value = '';
    document.getElementById('auth-submit-btn').disabled = false;
    document.getElementById('auth-submit-btn').textContent = 'Log In';
  }

  // --- General Display Formatting ---
  function getCurrencySymbol() {
    const cur = state.profile.currency || 'INR';
    return CURRENCIES[cur] ? CURRENCIES[cur].symbol : '$';
  }

  function formatCurrency(amount) {
    const cur = state.profile.currency || 'INR';
    const cfg = CURRENCIES[cur] || CURRENCIES.USD;
    return new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // Flash UI notifications
  function showNotification(message, type = 'success') {
    const banner = document.getElementById('notification-banner');
    const text = document.getElementById('notification-text');
    const iconWrapper = banner.querySelector('.notification-icon');

    banner.className = 'notification-banner';
    banner.classList.add(type);
    text.textContent = message;

    let iconHTML = '';
    if (type === 'success') {
      iconHTML = '<i data-lucide="check-circle-2"></i>';
    } else if (type === 'error') {
      iconHTML = '<i data-lucide="alert-octagon"></i>';
    } else {
      iconHTML = '<i data-lucide="alert-triangle"></i>';
    }
    iconWrapper.innerHTML = iconHTML;

    lucide.createIcons();

    banner.classList.add('active');

    setTimeout(() => {
      banner.classList.remove('active');
    }, 3500);
  }

  // Apply Theme Hues and Light/Dark values globally
  function applyTheme() {
    const root = document.documentElement;
    root.setAttribute('data-theme', state.profile.themeMode);
    root.style.setProperty('--accent-hue', state.profile.themeHue);
    
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.innerHTML = state.profile.themeMode === 'light' 
        ? '<i data-lucide="moon"></i>' 
        : '<i data-lucide="sun"></i>';
      lucide.createIcons();
    }
    
    const hueOptions = document.querySelectorAll('.color-option');
    hueOptions.forEach(opt => {
      const hue = parseInt(opt.getAttribute('data-hue'), 10);
      if (hue === state.profile.themeHue) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });

    const nameInput = document.getElementById('settings-username-input');
    if (nameInput) nameInput.value = state.profile.name;

    const currSelect = document.getElementById('settings-currency-select');
    if (currSelect) currSelect.value = state.profile.currency;
  }

  // --- View Controller Router ---
  function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
      item.addEventListener('click', function () {
        const viewName = this.getAttribute('data-view');
        
        navItems.forEach(n => n.classList.remove('active'));
        this.classList.add('active');

        sections.forEach(sec => {
          if (sec.id === `view-${viewName}`) {
            sec.classList.add('active');
          } else {
            sec.classList.remove('active');
          }
        });

        triggerViewRender(viewName);
      });
    });

    // Custom view trigger bindings
    document.getElementById('dashboard-view-all-transactions').addEventListener('click', () => {
      triggerViewClick('transactions');
    });

    document.getElementById('dashboard-view-all-budgets').addEventListener('click', () => {
      triggerViewClick('budgets');
    });
  }

  function triggerViewClick(viewName) {
    const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (navItem) {
      navItem.click();
    }
  }

  function triggerViewRender(viewName) {
    // Refresh Welcome text if loaded
    document.getElementById('welcome-title').textContent = `Hello, ${state.profile.name.split(' ')[0]}`;

    switch (viewName) {
      case 'dashboard':
        renderDashboard();
        break;
      case 'transactions':
        txPagination.currentPage = 1;
        renderTransactionsTable();
        populateCategoriesDropdowns();
        break;
      case 'budgets':
        renderBudgetsAndGoals();
        break;
      case 'reports':
        renderReports();
        break;
      case 'settings':
        renderSettings();
        break;
    }
  }

  // --- Data Calculations ---
  function getTransactionsForMonth(date, transactionsList = state.transactions) {
    const year = date.getFullYear();
    const month = date.getMonth();
    return transactionsList.filter(t => {
      const tDate = new Date(t.date);
      return tDate.getFullYear() === year && tDate.getMonth() === month;
    });
  }

  function calculateTotals(transactionsList) {
    let income = 0;
    let expense = 0;
    transactionsList.forEach(t => {
      if (t.type === 'income') {
        income += t.amount;
      } else {
        expense += t.amount;
      }
    });
    return { income, expense, balance: income - expense };
  }

  // --- Dashboard Rendering Engine ---
  function renderDashboard() {
    const today = new Date();
    const curMonthTransactions = getTransactionsForMonth(today);
    
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(today.getMonth() - 1);
    const lastMonthTransactions = getTransactionsForMonth(lastMonthDate);

    const curTotals = calculateTotals(curMonthTransactions);
    const lastTotals = calculateTotals(lastMonthTransactions);

    const allTotals = calculateTotals(state.transactions);

    document.getElementById('dashboard-net-balance').textContent = formatCurrency(allTotals.balance);
    document.getElementById('dashboard-total-income').textContent = formatCurrency(curTotals.income);
    document.getElementById('dashboard-total-expenses').textContent = formatCurrency(curTotals.expense);

    const savingsRate = curTotals.income > 0 
      ? Math.max(0, Math.round(((curTotals.income - curTotals.expense) / curTotals.income) * 100))
      : 0;
    
    document.getElementById('dashboard-savings-rate').textContent = `${savingsRate}%`;
    const savingsStatus = document.getElementById('dashboard-savings-status');
    if (savingsRate >= 20) {
      savingsStatus.className = 'stat-change up';
      savingsStatus.innerHTML = '<i data-lucide="check-circle-2"></i> <span>Meeting Target (20%)</span>';
    } else {
      savingsStatus.className = 'stat-change';
      savingsStatus.innerHTML = '<i data-lucide="activity"></i> <span>Below 20% Target</span>';
    }

    updateDashboardComparison('income', curTotals.income, lastTotals.income);
    updateDashboardComparison('expense', curTotals.expense, lastTotals.expense);

    renderRecentTransactionsList();
    renderActiveBudgetsList();

    renderDashboardCharts();

    lucide.createIcons();
  }

  function updateDashboardComparison(type, currentVal, previousVal) {
    const elem = document.getElementById(`dashboard-${type}-change`);
    if (!elem) return;

    if (previousVal === 0) {
      elem.className = 'stat-change';
      elem.innerHTML = '<i data-lucide="info"></i> <span>No previous month records</span>';
      return;
    }

    const diffPercent = ((currentVal - previousVal) / previousVal) * 100;
    const formatted = Math.abs(diffPercent).toFixed(0);

    if (type === 'income') {
      if (diffPercent >= 0) {
        elem.className = 'stat-change up';
        elem.innerHTML = `<i data-lucide="trending-up"></i> <span>+${formatted}% vs last month</span>`;
      } else {
        elem.className = 'stat-change down';
        elem.innerHTML = `<i data-lucide="trending-down"></i> <span>-${formatted}% vs last month</span>`;
      }
    } else {
      if (diffPercent <= 0) {
        elem.className = 'stat-change up';
        elem.innerHTML = `<i data-lucide="trending-down"></i> <span>-${formatted}% vs last month</span>`;
      } else {
        elem.className = 'stat-change down';
        elem.innerHTML = `<i data-lucide="trending-up"></i> <span>+${formatted}% vs last month</span>`;
      }
    }
  }

  function renderRecentTransactionsList() {
    const listContainer = document.getElementById('dashboard-recent-transactions');
    
    const sorted = [...state.transactions].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (dateB - dateA !== 0) return dateB - dateA;
      return b.id.localeCompare(a.id);
    });

    const recent = sorted.slice(0, 5);

    if (recent.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <i data-lucide="credit-card"></i>
          <h4>No Transactions Yet</h4>
          <p>Click "Add Transaction" to start recording your cash flows.</p>
        </div>`;
      return;
    }

    listContainer.innerHTML = '';
    recent.forEach(tx => {
      const style = getCategoryStyle(tx.category);
      const item = document.createElement('div');
      item.className = 'transaction-item';
      
      const typeSign = tx.type === 'income' ? '+' : '-';
      const amountClass = tx.type === 'income' ? 'income' : 'expense';

      let iconName = 'arrow-right-left';
      if (tx.type === 'income') iconName = 'arrow-down-left';
      else {
        if (tx.category.includes('Food')) iconName = 'utensils';
        else if (tx.category.includes('Shopping')) iconName = 'shopping-bag';
        else if (tx.category.includes('Rent')) iconName = 'home';
        else if (tx.category.includes('Bills')) iconName = 'file-text';
        else if (tx.category.includes('Entertainment')) iconName = 'clapperboard';
        else if (tx.category.includes('Transportation')) iconName = 'car';
        else if (tx.category.includes('Healthcare')) iconName = 'heart-pulse';
        else if (tx.category.includes('Travel')) iconName = 'plane';
      }

      item.innerHTML = `
        <div class="item-category-icon" style="--cat-color: ${style.color}; --cat-glow: rgba(${style.hue ? hexToRgb(style.color) : '59,130,246'}, 0.12);">
          <i data-lucide="${iconName}"></i>
        </div>
        <div class="item-details">
          <span class="item-title">${escapeHtml(tx.description)}</span>
          <div class="item-meta">
            <span class="item-badge">${escapeHtml(tx.category)}</span>
            <span>•</span>
            <span>${formatDate(tx.date)}</span>
            <span>•</span>
            <span>${escapeHtml(tx.method)}</span>
          </div>
        </div>
        <div class="item-amount-wrapper">
          <span class="item-amount ${amountClass}">${typeSign}${formatCurrency(tx.amount)}</span>
        </div>
        <div class="item-actions">
          <button class="action-btn-small edit" data-id="${tx.id}" title="Edit"><i data-lucide="edit-3"></i></button>
          <button class="action-btn-small delete" data-id="${tx.id}" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      `;

      item.querySelector('.edit').addEventListener('click', (e) => {
        e.stopPropagation();
        openTransactionModal(tx.id);
      });
      item.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTransaction(tx.id);
      });

      listContainer.appendChild(item);
    });
  }

  function renderActiveBudgetsList() {
    const budgetList = document.getElementById('dashboard-active-budgets');
    const budgetKeys = Object.keys(state.budgets);

    if (budgetKeys.length === 0) {
      budgetList.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem 1rem;">
          <i data-lucide="pie-chart"></i>
          <p>No budgets set. Click "Manage" to configure monthly spending limits.</p>
        </div>`;
      return;
    }

    const today = new Date();
    const curMonthTx = getTransactionsForMonth(today);
    const categorySpent = {};

    curMonthTx.forEach(t => {
      if (t.type === 'expense') {
        categorySpent[t.category] = (categorySpent[t.category] || 0) + t.amount;
      }
    });

    budgetList.innerHTML = '';
    
    const budgetsData = budgetKeys.map(cat => {
      const limit = state.budgets[cat];
      const spent = categorySpent[cat] || 0;
      const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      return { cat, limit, spent, pct };
    }).sort((a, b) => b.pct - a.pct).slice(0, 3);

    budgetsData.forEach(b => {
      const style = getCategoryStyle(b.cat);
      const wrapper = document.createElement('div');
      wrapper.className = 'budget-progress-container';

      let colorClass = '';
      if (b.pct >= 90) colorClass = 'danger';
      else if (b.pct >= 70) colorClass = 'warning';

      wrapper.innerHTML = `
        <div class="budget-meta">
          <div class="budget-cat-details">
            <span style="display:inline-block; width: 10px; height: 10px; border-radius:50%; background: ${style.color};"></span>
            <span class="budget-title" style="font-size:0.9rem;">${escapeHtml(b.cat)}</span>
          </div>
          <div class="budget-stats" style="font-size:0.8rem; gap: 0.25rem;">
            <span class="budget-spent">${formatCurrency(b.spent)}</span>
            <span class="budget-limit">/ ${formatCurrency(b.limit)}</span>
          </div>
        </div>
        <div class="progress-track" style="height: 6px;">
          <div class="progress-bar ${colorClass}" style="width: ${Math.min(b.pct, 100)}%;"></div>
        </div>
      `;
      budgetList.appendChild(wrapper);
    });
  }

  function renderDashboardCharts() {
    const today = new Date();
    const flowCtx = document.getElementById('flowChart').getContext('2d');
    const periodType = document.getElementById('dashboard-chart-period').value;

    const dataFlow = getFlowChartData(periodType);

    if (charts.flow) {
      charts.flow.destroy();
    }

    charts.flow = new Chart(flowCtx, {
      type: 'line',
      data: {
        labels: dataFlow.labels,
        datasets: [
          {
            label: 'Income',
            data: dataFlow.income,
            borderColor: '#00ff87',
            backgroundColor: 'rgba(0, 255, 135, 0.05)',
            fill: true,
            tension: 0.4,
            borderWidth: 3,
            pointRadius: 2,
            pointHoverRadius: 6
          },
          {
            label: 'Expense',
            data: dataFlow.expense,
            borderColor: '#ff0055',
            backgroundColor: 'rgba(255, 0, 85, 0.05)',
            fill: true,
            tension: 0.4,
            borderWidth: 3,
            pointRadius: 2,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: getThemeTextColor(),
              font: { family: 'Outfit', size: 12 }
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            titleFont: { family: 'Outfit', size: 13 },
            bodyFont: { family: 'Outfit', size: 12 }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: getThemeTextColor(), font: { family: 'Outfit' } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: getThemeTextColor(), font: { family: 'Outfit' } }
          }
        }
      }
    });

    const categoryCtx = document.getElementById('categoryChart').getContext('2d');
    const categoryData = getCategoryChartData(today);

    if (charts.category) {
      charts.category.destroy();
    }

    if (categoryData.values.length === 0) {
      charts.category = new Chart(categoryCtx, {
        type: 'doughnut',
        data: {
          labels: ['No Data'],
          datasets: [{
            data: [1],
            backgroundColor: ['rgba(150, 150, 150, 0.1)'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          }
        }
      });
      return;
    }

    charts.category = new Chart(categoryCtx, {
      type: 'doughnut',
      data: {
        labels: categoryData.labels,
        datasets: [{
          data: categoryData.values,
          backgroundColor: categoryData.colors,
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: getThemeTextColor(),
              font: { family: 'Outfit', size: 11 },
              boxWidth: 12
            }
          },
          tooltip: {
            titleFont: { family: 'Outfit', size: 12 },
            bodyFont: { family: 'Outfit', size: 12 },
            callbacks: {
              label: function (context) {
                const label = context.label || '';
                const val = context.parsed || 0;
                return ` ${label}: ${formatCurrency(val)}`;
              }
            }
          }
        }
      }
    });
  }

  function getThemeTextColor() {
    return state.profile.themeMode === 'light' ? '#4b5563' : '#9ca3af';
  }

  function getFlowChartData(periodType) {
    const today = new Date();
    const curMonthTx = getTransactionsForMonth(today);

    if (periodType === 'weekly') {
      const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
      const income = [0, 0, 0, 0];
      const expense = [0, 0, 0, 0];

      curMonthTx.forEach(t => {
        const date = new Date(t.date);
        const day = date.getDate();
        let weekIndex = Math.min(3, Math.floor((day - 1) / 7));
        if (t.type === 'income') {
          income[weekIndex] += t.amount;
        } else {
          expense[weekIndex] += t.amount;
        }
      });

      return { labels, income, expense };
    } else {
      const totalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const labels = [];
      const income = [];
      const expense = [];

      for (let day = 1; day <= totalDays; day += 3) {
        const nextDay = Math.min(day + 2, totalDays);
        labels.push(`${day}-${nextDay}`);
        
        let chunkIncome = 0;
        let chunkExpense = 0;

        curMonthTx.forEach(t => {
          const tDay = new Date(t.date).getDate();
          if (tDay >= day && tDay <= nextDay) {
            if (t.type === 'income') chunkIncome += t.amount;
            else chunkExpense += t.amount;
          }
        });

        income.push(chunkIncome);
        expense.push(chunkExpense);
      }

      return { labels, income, expense };
    }
  }

  function getCategoryChartData(date) {
    const monthTx = getTransactionsForMonth(date);
    const spentObj = {};

    monthTx.forEach(t => {
      if (t.type === 'expense') {
        spentObj[t.category] = (spentObj[t.category] || 0) + t.amount;
      }
    });

    const labels = Object.keys(spentObj);
    const values = labels.map(l => spentObj[l]);
    const colors = labels.map(l => getCategoryStyle(l).color);

    return { labels, values, colors };
  }

  // --- Transactions Manager Render Engine ---
  function renderTransactionsTable() {
    const tableBody = document.getElementById('transactions-table-body');
    const search = document.getElementById('tx-search-input').value.toLowerCase();
    const filterType = document.getElementById('tx-filter-type').value;
    const filterCategory = document.getElementById('tx-filter-category').value;
    const startDateVal = document.getElementById('tx-filter-start-date').value;
    const endDateVal = document.getElementById('tx-filter-end-date').value;

    let list = state.transactions.filter(t => {
      const matchSearch = t.description.toLowerCase().includes(search) || t.category.toLowerCase().includes(search);
      const matchType = filterType === 'all' || t.type === filterType;
      const matchCat = filterCategory === 'all' || t.category === filterCategory;

      let matchDate = true;
      if (startDateVal) {
        matchDate = matchDate && t.date >= startDateVal;
      }
      if (endDateVal) {
        matchDate = matchDate && t.date <= endDateVal;
      }

      return matchSearch && matchType && matchCat && matchDate;
    });

    list.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (dateB - dateA !== 0) return dateB - dateA;
      return b.id.localeCompare(a.id);
    });

    txPagination.filteredList = list;

    const totalEntries = list.length;
    const maxPage = Math.max(1, Math.ceil(totalEntries / txPagination.itemsPerPage));
    if (txPagination.currentPage > maxPage) {
      txPagination.currentPage = maxPage;
    }

    const startIdx = (txPagination.currentPage - 1) * txPagination.itemsPerPage;
    const endIdx = Math.min(startIdx + txPagination.itemsPerPage, totalEntries);
    const paginatedList = list.slice(startIdx, endIdx);

    if (paginatedList.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state">
              <i data-lucide="inbox"></i>
              <h4>No matching transactions found</h4>
              <p>Try relaxing your filters or check search query.</p>
            </div>
          </td>
        </tr>`;
      
      document.getElementById('tx-pagination-info').textContent = 'Showing 0 of 0 entries';
      document.getElementById('tx-prev-page-btn').disabled = true;
      document.getElementById('tx-next-page-btn').disabled = true;
      lucide.createIcons();
      return;
    }

    tableBody.innerHTML = '';
    paginatedList.forEach(t => {
      const row = document.createElement('tr');
      const style = getCategoryStyle(t.category);
      const badgeGlow = `rgba(${style.hue ? hexToRgb(style.color) : '59,130,246'}, 0.1)`;

      const sign = t.type === 'income' ? '+' : '-';
      const amountClass = t.type === 'income' ? 'income' : 'expense';

      row.innerHTML = `
        <td>${formatDate(t.date)}</td>
        <td><strong>${escapeHtml(t.description)}</strong></td>
        <td>
          <span class="category-pill" style="--cat-color: ${style.color}; --cat-glow: ${badgeGlow};">
            ${escapeHtml(t.category)}
          </span>
        </td>
        <td>${escapeHtml(t.method)}</td>
        <td style="text-align: right;" class="item-amount ${amountClass}">${sign}${formatCurrency(t.amount)}</td>
        <td style="text-align: center;">
          <button class="action-btn-small edit" data-id="${t.id}" title="Edit"><i data-lucide="edit-3"></i></button>
          <button class="action-btn-small delete" data-id="${t.id}" title="Delete"><i data-lucide="trash-2"></i></button>
        </td>
      `;

      row.querySelector('.edit').addEventListener('click', () => openTransactionModal(t.id));
      row.querySelector('.delete').addEventListener('click', () => deleteTransaction(t.id));

      tableBody.appendChild(row);
    });

    document.getElementById('tx-pagination-info').textContent = `Showing ${startIdx + 1} to ${endIdx} of ${totalEntries} entries`;
    
    const prevBtn = document.getElementById('tx-prev-page-btn');
    const nextBtn = document.getElementById('tx-next-page-btn');
    
    prevBtn.disabled = txPagination.currentPage === 1;
    nextBtn.disabled = txPagination.currentPage === maxPage;

    lucide.createIcons();
  }

  function handlePagination() {
    document.getElementById('tx-prev-page-btn').addEventListener('click', () => {
      if (txPagination.currentPage > 1) {
        txPagination.currentPage--;
        renderTransactionsTable();
      }
    });

    document.getElementById('tx-next-page-btn').addEventListener('click', () => {
      const maxPage = Math.ceil(txPagination.filteredList.length / txPagination.itemsPerPage);
      if (txPagination.currentPage < maxPage) {
        txPagination.currentPage++;
        renderTransactionsTable();
      }
    });
  }

  function populateCategoriesDropdowns() {
    const filterCat = document.getElementById('tx-filter-category');
    const modalCat = document.getElementById('tx-modal-category');
    const budgetCat = document.getElementById('budget-modal-category');

    const filterSelected = filterCat.value;
    const modalSelected = modalCat.value;
    const budgetSelected = budgetCat.value;

    filterCat.innerHTML = '<option value="all">All Categories</option>';
    
    const sortedExpense = [...state.categories.expense].sort();
    const sortedIncome = [...state.categories.income].sort();

    filterCat.innerHTML += `<optgroup label="Expenses">${sortedExpense.map(c => `<option value="${c}">${c}</option>`).join('')}</optgroup>`;
    filterCat.innerHTML += `<optgroup label="Income">${sortedIncome.map(c => `<option value="${c}">${c}</option>`).join('')}</optgroup>`;

    modalCat.innerHTML = '';
    const activeType = document.querySelector('#transaction-modal .form-toggle-option.active').getAttribute('data-type');
    const activeCats = state.categories[activeType] || [];
    modalCat.innerHTML = activeCats.map(c => `<option value="${c}">${c}</option>`).join('');

    budgetCat.innerHTML = sortedExpense.map(c => `<option value="${c}">${c}</option>`).join('');

    if (filterSelected && Array.from(filterCat.options).some(o => o.value === filterSelected)) {
      filterCat.value = filterSelected;
    }
    if (modalSelected && Array.from(modalCat.options).some(o => o.value === modalSelected)) {
      modalCat.value = modalSelected;
    }
    if (budgetSelected && Array.from(budgetCat.options).some(o => o.value === budgetSelected)) {
      budgetCat.value = budgetSelected;
    }
  }

  // --- Budgets & Savings Goals Render Engine ---
  function renderBudgetsAndGoals() {
    const budgetsGrid = document.getElementById('budgets-card-grid');
    const budgetKeys = Object.keys(state.budgets);

    const today = new Date();
    const curMonthTx = getTransactionsForMonth(today);
    const categorySpent = {};
    curMonthTx.forEach(t => {
      if (t.type === 'expense') {
        categorySpent[t.category] = (categorySpent[t.category] || 0) + t.amount;
      }
    });

    if (budgetKeys.length === 0) {
      budgetsGrid.innerHTML = `
        <div class="glass-panel" style="grid-column: span 3; text-align: center; padding: 3rem 1.5rem;">
          <div class="empty-state">
            <i data-lucide="pie-chart"></i>
            <h4>No Category Budgets Set</h4>
            <p>Set budget limits for your expense categories to keep track of spending limits.</p>
          </div>
        </div>`;
    } else {
      budgetsGrid.innerHTML = '';
      budgetKeys.forEach(cat => {
        const limit = state.budgets[cat];
        const spent = categorySpent[cat] || 0;
        const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
        
        let barColorClass = '';
        if (pct >= 90) barColorClass = 'danger';
        else if (pct >= 70) barColorClass = 'warning';

        const style = getCategoryStyle(cat);
        const card = document.createElement('div');
        card.className = 'glass-panel budget-card';
        card.innerHTML = `
          <div class="budget-meta">
            <div class="budget-cat-details">
              <span style="display:inline-block; width: 12px; height: 12px; border-radius:50%; background: ${style.color};"></span>
              <span class="budget-title">${escapeHtml(cat)}</span>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="action-btn-small edit-budget" data-cat="${cat}" title="Edit Limit"><i data-lucide="edit-2"></i></button>
              <button class="action-btn-small delete-budget" data-cat="${cat}" title="Remove Budget"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="budget-progress-container">
            <div class="progress-track">
              <div class="progress-bar ${barColorClass}" style="width: ${Math.min(pct, 100)}%;"></div>
            </div>
          </div>
          <div class="budget-stats">
            <div>
              <span class="budget-spent">${formatCurrency(spent)}</span>
              <span class="budget-limit">spent of ${formatCurrency(limit)}</span>
            </div>
            <span class="budget-percent" style="color: ${pct >= 90 ? 'var(--color-expense)' : pct >= 70 ? 'var(--color-warning)' : 'var(--color-income)'}">${pct}%</span>
          </div>
        `;

        card.querySelector('.edit-budget').addEventListener('click', () => {
          openBudgetModal(cat);
        });
        card.querySelector('.delete-budget').addEventListener('click', () => {
          deleteBudget(cat);
        });

        budgetsGrid.appendChild(card);
      });
    }

    const goalsGrid = document.getElementById('goals-card-grid');
    if (state.goals.length === 0) {
      goalsGrid.innerHTML = `
        <div class="glass-panel" style="grid-column: span 2; text-align: center; padding: 3rem 1.5rem;">
          <div class="empty-state">
            <i data-lucide="piggy-bank"></i>
            <h4>No Savings Goals Created</h4>
            <p>Define targets for your vacations, hardware updates, or investments.</p>
          </div>
        </div>`;
    } else {
      goalsGrid.innerHTML = '';
      state.goals.forEach(goal => {
        const pct = goal.target > 0 ? Math.round((goal.saved / goal.target) * 100) : 0;
        
        const radius = 36;
        const circ = 2 * Math.PI * radius;
        const strokeDashoffset = circ - (Math.min(pct, 100) / 100) * circ;

        const card = document.createElement('div');
        card.className = 'glass-panel goal-card';
        card.innerHTML = `
          <div class="goal-radial-wrapper">
            <svg class="goal-svg">
              <circle class="goal-svg-bg" cx="40" cy="40" r="${radius}"></circle>
              <circle class="goal-svg-progress" cx="40" cy="40" r="${radius}" 
                style="stroke-dasharray: ${circ}; stroke-dashoffset: ${strokeDashoffset};"></circle>
            </svg>
            <div class="goal-radial-value">${pct}%</div>
          </div>
          <div class="goal-info">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="goal-name">${escapeHtml(goal.name)}</span>
              <div style="display:flex; gap:0.25rem;">
                <button class="action-btn-small edit-goal" data-id="${goal.id}" title="Edit"><i data-lucide="edit-3"></i></button>
                <button class="action-btn-small delete-goal" data-id="${goal.id}" title="Delete"><i data-lucide="trash-2"></i></button>
              </div>
            </div>
            <div class="goal-target-amount">
              Saved: <span>${formatCurrency(goal.saved)}</span> of <span>${formatCurrency(goal.target)}</span>
            </div>
            <div class="goal-date">
              <i data-lucide="calendar"></i>
              <span>Target: ${formatDate(goal.date)}</span>
            </div>
          </div>
        `;

        card.querySelector('.edit-goal').addEventListener('click', () => {
          openGoalModal(goal.id);
        });
        card.querySelector('.delete-goal').addEventListener('click', () => {
          deleteGoal(goal.id);
        });

        goalsGrid.appendChild(card);
      });
    }

    lucide.createIcons();
  }

  // --- Reports & Insights Rendering Engine ---
  function renderReports() {
    const today = new Date();
    const yearSelect = document.getElementById('reports-chart-year');
    const years = [...new Set(state.transactions.map(t => new Date(t.date).getFullYear()))].sort((a,b)=>b-a);
    
    if (years.length > 0) {
      yearSelect.innerHTML = years.map(y => `<option value="${y}" ${y === today.getFullYear() ? 'selected' : ''}>${y}</option>`).join('');
    }

    const monthSelect = document.getElementById('reports-breakdown-month');
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    monthSelect.innerHTML = months.map((m, idx) => `<option value="${idx}" ${idx === today.getMonth() ? 'selected' : ''}>${m}</option>`).join('');

    renderReportsCharts();
    renderInsightsPanel();
  }

  function renderReportsCharts() {
    const year = parseInt(document.getElementById('reports-chart-year').value, 10) || new Date().getFullYear();
    const monthIdx = parseInt(document.getElementById('reports-breakdown-month').value, 10) || new Date().getMonth();

    const analysisCtx = document.getElementById('reportsAnalysisChart').getContext('2d');
    const monthlySummary = getMonthlySummaryData(year);

    if (charts.reportsAnalysis) {
      charts.reportsAnalysis.destroy();
    }

    charts.reportsAnalysis = new Chart(analysisCtx, {
      type: 'bar',
      data: {
        labels: monthlySummary.labels,
        datasets: [
          {
            label: 'Income',
            data: monthlySummary.income,
            backgroundColor: '#00ff87',
            borderRadius: 4
          },
          {
            label: 'Expense',
            data: monthlySummary.expense,
            backgroundColor: '#ff0055',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: getThemeTextColor(),
              font: { family: 'Outfit' }
            }
          },
          tooltip: {
            titleFont: { family: 'Outfit' },
            bodyFont: { family: 'Outfit' }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: getThemeTextColor(), font: { family: 'Outfit' } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: getThemeTextColor(), font: { family: 'Outfit' } }
          }
        }
      }
    });

    const breakdownCtx = document.getElementById('reportsBreakdownChart').getContext('2d');
    const dateObj = new Date(year, monthIdx, 1);
    const breakdownData = getCategoryChartData(dateObj);

    if (charts.reportsBreakdown) {
      charts.reportsBreakdown.destroy();
    }

    if (breakdownData.values.length === 0) {
      charts.reportsBreakdown = new Chart(breakdownCtx, {
        type: 'pie',
        data: {
          labels: ['No Data'],
          datasets: [{
            data: [1],
            backgroundColor: ['rgba(150, 150, 150, 0.1)'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });
      return;
    }

    charts.reportsBreakdown = new Chart(breakdownCtx, {
      type: 'pie',
      data: {
        labels: breakdownData.labels,
        datasets: [{
          data: breakdownData.values,
          backgroundColor: breakdownData.colors,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.05)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: getThemeTextColor(),
              font: { family: 'Outfit', size: 11 },
              boxWidth: 12
            }
          },
          tooltip: {
            titleFont: { family: 'Outfit' },
            bodyFont: { family: 'Outfit' },
            callbacks: {
              label: function (context) {
                const label = context.label || '';
                const val = context.parsed || 0;
                return ` ${label}: ${formatCurrency(val)}`;
              }
            }
          }
        }
      }
    });
  }

  function getMonthlySummaryData(year) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const income = Array(12).fill(0);
    const expense = Array(12).fill(0);

    state.transactions.forEach(t => {
      const date = new Date(t.date);
      if (date.getFullYear() === year) {
        const month = date.getMonth();
        if (t.type === 'income') {
          income[month] += t.amount;
        } else {
          expense[month] += t.amount;
        }
      }
    });

    return { labels: months, income, expense };
  }

  function renderInsightsPanel() {
    const container = document.getElementById('insights-container');
    const today = new Date();
    const curMonthTx = getTransactionsForMonth(today);
    
    const curTotals = calculateTotals(curMonthTx);
    const savingsRate = curTotals.income > 0 ? ((curTotals.income - curTotals.expense) / curTotals.income) * 100 : 0;

    const insights = [];

    if (savingsRate < 10 && curTotals.income > 0) {
      insights.push({
        type: 'warning',
        icon: 'alert-triangle',
        headline: 'Low Savings Rate Warning',
        desc: `Your savings rate is currently ${savingsRate.toFixed(0)}%. We recommend keeping expenses under 80% of income to meet savings targets.`
      });
    } else if (savingsRate >= 30) {
      insights.push({
        type: 'success',
        icon: 'smile',
        headline: 'Excellent Savings Rate!',
        desc: `Great job! You've saved ${savingsRate.toFixed(0)}% of your income this month. You're on track to accelerate your financial goals.`
      });
    }

    const catSpent = {};
    curMonthTx.forEach(t => {
      if (t.type === 'expense') {
        catSpent[t.category] = (catSpent[t.category] || 0) + t.amount;
      }
    });

    Object.keys(state.budgets).forEach(cat => {
      const limit = state.budgets[cat];
      const spent = catSpent[cat] || 0;
      const pct = limit > 0 ? (spent / limit) * 100 : 0;

      if (pct >= 100) {
        insights.push({
          type: 'warning',
          icon: 'alert-circle',
          headline: `Budget Exceeded: ${cat}`,
          desc: `You have spent ${formatCurrency(spent)} which exceeds your monthly budget of ${formatCurrency(limit)} for ${cat} by ${formatCurrency(spent - limit)}.`
        });
      } else if (pct >= 80) {
        insights.push({
          type: 'info',
          icon: 'bell',
          headline: `Nearing Budget Limit: ${cat}`,
          desc: `You have used ${pct.toFixed(0)}% of your monthly budget limit (${formatCurrency(limit)}) for ${cat}. Plan your remaining purchases carefully.`
        });
      }
    });

    if (state.goals.length > 0) {
      const topGoal = [...state.goals].sort((a,b) => {
        const pctA = a.target > 0 ? (a.saved / a.target) : 0;
        const pctB = b.target > 0 ? (b.saved / b.target) : 0;
        return pctB - pctA;
      })[0];
      
      const pct = topGoal.target > 0 ? Math.round((topGoal.saved / topGoal.target) * 100) : 0;
      insights.push({
        type: 'info',
        icon: 'award',
        headline: `Progress Focus: ${topGoal.name}`,
        desc: `Your savings goal "${topGoal.name}" is ${pct}% complete! You need ${formatCurrency(topGoal.target - topGoal.saved)} more to hit your target by ${formatDate(topGoal.date)}.`
      });
    }

    if (insights.length === 0) {
      insights.push({
        type: 'info',
        icon: 'trending-up',
        headline: 'Aura Analytics Active',
        desc: 'Log more transactions and set category budgets to unlock deep financial suggestions here.'
      });
    }

    container.innerHTML = '';
    insights.forEach(ins => {
      const card = document.createElement('div');
      card.className = `insight-card ${ins.type}`;
      card.innerHTML = `
        <div class="insight-icon">
          <i data-lucide="${ins.icon}"></i>
        </div>
        <div class="insight-content">
          <h4 class="insight-headline">${escapeHtml(ins.headline)}</h4>
          <p class="insight-desc">${escapeHtml(ins.desc)}</p>
        </div>
      `;
      container.appendChild(card);
    });

    lucide.createIcons();
  }

  // --- Settings View Layout Rendering ---
  function renderSettings() {
    renderCategoryChips('income');
    renderCategoryChips('expense');
  }

  function renderCategoryChips(type) {
    const list = document.getElementById(`${type}-categories-list`);
    const cats = state.categories[type] || [];

    list.innerHTML = '';
    cats.forEach(c => {
      const chip = document.createElement('div');
      chip.className = 'category-chip';
      
      const isDefault = DEFAULT_CATEGORIES[type].includes(c);
      const deleteBtn = !isDefault 
        ? `<button class="category-chip-btn delete-cat" data-cat="${c}" data-type="${type}"><i data-lucide="x"></i></button>`
        : '';

      chip.innerHTML = `
        <span>${escapeHtml(c)}</span>
        ${deleteBtn}
      `;

      if (!isDefault) {
        chip.querySelector('.delete-cat').addEventListener('click', function() {
          deleteCategory(this.getAttribute('data-cat'), this.getAttribute('data-type'));
        });
      }

      list.appendChild(chip);
    });
    lucide.createIcons();
  }

  function deleteCategory(cat, type) {
    const isUsed = state.transactions.some(t => t.type === type && t.category === cat);
    if (isUsed) {
      showNotification(`Cannot delete "${cat}". It is used by existing transactions.`, 'error');
      return;
    }

    state.categories[type] = state.categories[type].filter(c => c !== cat);
    
    if (type === 'expense' && state.budgets[cat] !== undefined) {
      delete state.budgets[cat];
      syncBudgetsToCloud();
    }

    syncCategoriesToCloud();
    renderSettings();
    populateCategoriesDropdowns();
    showNotification(`Deleted category "${cat}" successfully.`, 'success');
  }

  // --- CRUD Modal Forms Logic ---

  // 1. Transaction Form Modal
  function openTransactionModal(id = null) {
    const modal = document.getElementById('transaction-modal');
    const title = document.getElementById('transaction-modal-title');
    const typeOptions = modal.querySelectorAll('.form-toggle-option');
    
    document.getElementById('tx-modal-id').value = '';
    document.getElementById('tx-modal-amount').value = '';
    document.getElementById('tx-modal-desc').value = '';
    document.getElementById('tx-modal-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('tx-modal-method').value = 'UPI / Wallet';

    if (id) {
      title.textContent = 'Edit Transaction';
      const tx = state.transactions.find(t => t.id === id);
      if (tx) {
        document.getElementById('tx-modal-id').value = tx.id;
        document.getElementById('tx-modal-amount').value = tx.amount;
        document.getElementById('tx-modal-desc').value = tx.description;
        document.getElementById('tx-modal-date').value = tx.date;
        document.getElementById('tx-modal-method').value = tx.method;
        
        typeOptions.forEach(opt => {
          if (opt.getAttribute('data-type') === tx.type) {
            opt.classList.add('active');
          } else {
            opt.classList.remove('active');
          }
        });
      }
    } else {
      title.textContent = 'Add Transaction';
      typeOptions.forEach(opt => {
        if (opt.getAttribute('data-type') === 'expense') {
          opt.classList.add('active');
        } else {
          opt.classList.remove('active');
        }
      });
    }

    populateCategoriesDropdowns();
    if (id) {
      const tx = state.transactions.find(t => t.id === id);
      if (tx) document.getElementById('tx-modal-category').value = tx.category;
    }
    
    modal.classList.add('active');
  }

  function saveTransaction() {
    const id = document.getElementById('tx-modal-id').value;
    const amountVal = parseFloat(document.getElementById('tx-modal-amount').value);
    const dateVal = document.getElementById('tx-modal-date').value;
    const catVal = document.getElementById('tx-modal-category').value;
    const methodVal = document.getElementById('tx-modal-method').value;
    const descVal = document.getElementById('tx-modal-desc').value.trim();
    const typeVal = document.querySelector('#transaction-modal .form-toggle-option.active').getAttribute('data-type');

    if (isNaN(amountVal) || amountVal <= 0) {
      showNotification('Please enter a valid positive amount.', 'error');
      return;
    }
    if (!dateVal) {
      showNotification('Please select a transaction date.', 'error');
      return;
    }
    if (!catVal) {
      showNotification('Please select a category.', 'error');
      return;
    }
    if (!descVal) {
      showNotification('Please write a quick description.', 'error');
      return;
    }

    let txObj = null;

    if (id) {
      const txIdx = state.transactions.findIndex(t => t.id === id);
      if (txIdx !== -1) {
        txObj = {
          id,
          type: typeVal,
          category: catVal,
          amount: amountVal,
          description: descVal,
          method: methodVal,
          date: dateVal
        };
        state.transactions[txIdx] = txObj;
        showNotification('Transaction updated successfully.', 'success');
      }
    } else {
      txObj = {
        id: `tx-${Date.now()}`,
        type: typeVal,
        category: catVal,
        amount: amountVal,
        description: descVal,
        method: methodVal,
        date: dateVal
      };
      state.transactions.push(txObj);
      showNotification('Transaction recorded successfully.', 'success');
    }

    // Sync to Cloud
    if (txObj) {
      writeTransactionToCloud(txObj);
    }
    
    closeAllModals();
    
    const currentActiveView = document.querySelector('.nav-item.active').getAttribute('data-view');
    triggerViewRender(currentActiveView);
  }

  function deleteTransaction(id) {
    if (confirm('Are you sure you want to delete this transaction record?')) {
      state.transactions = state.transactions.filter(t => t.id !== id);
      
      // Delete from cloud
      deleteTransactionFromCloud(id);
      
      showNotification('Transaction deleted.', 'warning');
      
      const currentActiveView = document.querySelector('.nav-item.active').getAttribute('data-view');
      triggerViewRender(currentActiveView);
    }
  }

  // 2. Budget Modal & Delete
  function openBudgetModal(category = null) {
    const modal = document.getElementById('budget-modal');
    populateCategoriesDropdowns();

    if (category) {
      document.getElementById('budget-modal-category').value = category;
      document.getElementById('budget-modal-category').disabled = true;
      document.getElementById('budget-modal-amount').value = state.budgets[category] || '';
    } else {
      document.getElementById('budget-modal-category').disabled = false;
      document.getElementById('budget-modal-amount').value = '';
    }

    modal.classList.add('active');
  }

  function saveBudget() {
    const cat = document.getElementById('budget-modal-category').value;
    const amount = parseInt(document.getElementById('budget-modal-amount').value, 10);

    if (!cat) {
      showNotification('Please choose an expense category.', 'error');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      showNotification('Please enter a valid positive budget limit.', 'error');
      return;
    }

    state.budgets[cat] = amount;
    
    // Sync to cloud
    syncBudgetsToCloud();

    closeAllModals();
    renderBudgetsAndGoals();
    showNotification(`Monthly budget limit set for ${cat}.`, 'success');
  }

  function deleteBudget(cat) {
    if (confirm(`Do you want to clear your monthly budget limit for "${cat}"?`)) {
      delete state.budgets[cat];
      
      // Sync to cloud
      syncBudgetsToCloud();

      renderBudgetsAndGoals();
      showNotification('Budget limit removed.', 'warning');
    }
  }

  // 3. Goals Modal & Delete
  function openGoalModal(id = null) {
    const modal = document.getElementById('goal-modal');
    const title = document.getElementById('goal-modal-title');
    
    document.getElementById('goal-modal-id').value = '';
    document.getElementById('goal-modal-name').value = '';
    document.getElementById('goal-modal-target').value = '';
    document.getElementById('goal-modal-saved').value = '0';
    document.getElementById('goal-modal-date').value = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (id) {
      title.textContent = 'Edit Savings Goal';
      const goal = state.goals.find(g => g.id === id);
      if (goal) {
        document.getElementById('goal-modal-id').value = goal.id;
        document.getElementById('goal-modal-name').value = goal.name;
        document.getElementById('goal-modal-target').value = goal.target;
        document.getElementById('goal-modal-saved').value = goal.saved;
        document.getElementById('goal-modal-date').value = goal.date;
      }
    } else {
      title.textContent = 'Create Savings Goal';
    }

    modal.classList.add('active');
  }

  function saveGoal() {
    const id = document.getElementById('goal-modal-id').value;
    const name = document.getElementById('goal-modal-name').value.trim();
    const target = parseFloat(document.getElementById('goal-modal-target').value);
    const saved = parseFloat(document.getElementById('goal-modal-saved').value);
    const date = document.getElementById('goal-modal-date').value;

    if (!name) {
      showNotification('Please enter a goal description/name.', 'error');
      return;
    }
    if (isNaN(target) || target <= 0) {
      showNotification('Please enter a valid positive target amount.', 'error');
      return;
    }
    if (isNaN(saved) || saved < 0) {
      showNotification('Please enter saved amount (>= 0).', 'error');
      return;
    }
    if (saved > target) {
      showNotification('Saved amount cannot be larger than the target limit.', 'error');
      return;
    }
    if (!date) {
      showNotification('Please set a target completion date.', 'error');
      return;
    }

    let goalObj = null;

    if (id) {
      const goalIdx = state.goals.findIndex(g => g.id === id);
      if (goalIdx !== -1) {
        goalObj = { id, name, target, saved, date };
        state.goals[goalIdx] = goalObj;
        showNotification('Savings goal updated.', 'success');
      }
    } else {
      goalObj = {
        id: `goal-${Date.now()}`,
        name,
        target,
        saved,
        date
      };
      state.goals.push(goalObj);
      showNotification('Savings goal created successfully.', 'success');
    }

    // Sync to Cloud
    if (goalObj) {
      writeGoalToCloud(goalObj);
    }

    closeAllModals();
    renderBudgetsAndGoals();
  }

  function deleteGoal(id) {
    if (confirm('Delete this savings goal?')) {
      state.goals = state.goals.filter(g => g.id !== id);
      
      // Delete from cloud
      deleteGoalFromCloud(id);

      renderBudgetsAndGoals();
      showNotification('Savings goal deleted.', 'warning');
    }
  }

  function closeAllModals() {
    const overlays = document.querySelectorAll('.modal-overlay');
    overlays.forEach(o => o.classList.remove('active'));
  }

  // --- Export/Import Services ---
  function exportTransactionsToCSV() {
    const txs = state.transactions;
    if (txs.length === 0) {
      showNotification('No transactions to export.', 'error');
      return;
    }

    const cur = state.profile.currency;
    let csvContent = `Date,Description,Category,Type,Payment Method,Amount (${cur})\n`;

    const sorted = [...txs].sort((a,b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(t => {
      const cleanDesc = t.description.replace(/"/g, '""');
      csvContent += `"${t.date}","${cleanDesc}","${t.category}","${t.type}","${t.method}",${t.amount}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `aura_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('Transactions downloaded as CSV.', 'success');
  }

  function backupData() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `aura_backup_${new Date().toISOString().split('T')[0]}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('Database backup JSON generated.', 'success');
  }

  function restoreData(file) {
    const reader = new FileReader();
    reader.onload = function (event) {
      try {
        const importedState = JSON.parse(event.target.result);
        
        if (importedState.profile && Array.isArray(importedState.transactions)) {
          state = importedState;
          
          // Write whole batch to Firestore
          if (currentUser) {
            const userRef = firestoreInstance.collection('users').doc(currentUser.uid);
            userRef.set(state.profile);
            userRef.collection('metadata').doc('categories').set(state.categories);
            userRef.collection('metadata').doc('budgets').set(state.budgets);
            
            // Rewrite transactions
            state.transactions.forEach(t => writeTransactionToCloud(t));
            // Rewrite goals
            state.goals.forEach(g => writeGoalToCloud(g));
          }

          applyTheme();
          
          const currentActiveView = document.querySelector('.nav-item.active').getAttribute('data-view');
          triggerViewRender(currentActiveView);
          
          showNotification('Database restored successfully from backup!', 'success');
        } else {
          showNotification('Invalid backup JSON format.', 'error');
        }
      } catch (e) {
        showNotification('Failed to parse uploaded backup file.', 'error');
      }
    };
    reader.readAsText(file);
  }

  // --- Attach Form & Button Click Listeners ---
  function initEventListeners() {
    document.getElementById('quick-add-transaction-btn').addEventListener('click', () => {
      openTransactionModal();
    });

    document.getElementById('save-transaction-btn').addEventListener('click', saveTransaction);
    document.getElementById('save-budget-btn').addEventListener('click', saveBudget);
    document.getElementById('save-goal-btn').addEventListener('click', saveGoal);

    document.getElementById('add-budget-trigger-btn').addEventListener('click', () => {
      openBudgetModal();
    });
    document.getElementById('add-goal-trigger-btn').addEventListener('click', () => {
      openGoalModal();
    });

    const closeBtns = document.querySelectorAll('[data-close-modal]');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        const modalId = this.getAttribute('data-close-modal');
        document.getElementById(modalId).classList.remove('active');
      });
    });

    const overlays = document.querySelectorAll('.modal-overlay');
    overlays.forEach(o => {
      o.addEventListener('click', function (e) {
        if (e.target === this) {
          this.classList.remove('active');
        }
      });
    });

    const toggleOptions = document.querySelectorAll('#transaction-modal .form-toggle-option');
    toggleOptions.forEach(opt => {
      opt.addEventListener('click', function () {
        toggleOptions.forEach(o => o.classList.remove('active'));
        this.classList.add('active');
        populateCategoriesDropdowns();
      });
    });

    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
      state.profile.themeMode = state.profile.themeMode === 'light' ? 'dark' : 'light';
      
      // Update cloud profile settings
      if (currentUser) {
        firestoreInstance.collection('users').doc(currentUser.uid).update({
          themeMode: state.profile.themeMode
        });
      }

      applyTheme();
      const currentActiveView = document.querySelector('.nav-item.active').getAttribute('data-view');
      triggerViewRender(currentActiveView);
    });

    document.getElementById('tx-search-input').addEventListener('input', () => {
      txPagination.currentPage = 1;
      renderTransactionsTable();
    });
    document.getElementById('tx-filter-type').addEventListener('change', () => {
      txPagination.currentPage = 1;
      renderTransactionsTable();
    });
    document.getElementById('tx-filter-category').addEventListener('change', () => {
      txPagination.currentPage = 1;
      renderTransactionsTable();
    });
    document.getElementById('tx-filter-start-date').addEventListener('change', () => {
      txPagination.currentPage = 1;
      renderTransactionsTable();
    });
    document.getElementById('tx-filter-end-date').addEventListener('change', () => {
      txPagination.currentPage = 1;
      renderTransactionsTable();
    });
    document.getElementById('dashboard-chart-period').addEventListener('change', () => {
      renderDashboardCharts();
    });

    document.getElementById('tx-export-csv-btn').addEventListener('click', exportTransactionsToCSV);

    document.getElementById('save-profile-settings-btn').addEventListener('click', () => {
      const name = document.getElementById('settings-username-input').value.trim();
      const cur = document.getElementById('settings-currency-select').value;
      
      if (!name) {
        showNotification('Please specify a username.', 'error');
        return;
      }

      state.profile.name = name;
      state.profile.currency = cur;
      
      // Sync profile change to cloud
      if (currentUser) {
        firestoreInstance.collection('users').doc(currentUser.uid).set(state.profile);
      }

      showNotification('Profile parameters saved.', 'success');
      triggerViewRender('settings');
    });

    const hueOptions = document.querySelectorAll('.color-option');
    hueOptions.forEach(opt => {
      opt.addEventListener('click', function () {
        const hue = parseInt(this.getAttribute('data-hue'), 10);
        state.profile.themeHue = hue;

        // Sync hue changes
        if (currentUser) {
          firestoreInstance.collection('users').doc(currentUser.uid).update({
            themeHue: hue
          });
        }

        applyTheme();
      });
    });

    document.getElementById('add-income-cat-btn').addEventListener('click', () => {
      const input = document.getElementById('new-income-category-input');
      const val = input.value.trim();
      if (!val) return;
      if (state.categories.income.includes(val)) {
        showNotification('Category already exists.', 'error');
        return;
      }
      state.categories.income.push(val);
      syncCategoriesToCloud();
      input.value = '';
      renderSettings();
      showNotification(`Added income category: ${val}`, 'success');
    });

    document.getElementById('add-expense-cat-btn').addEventListener('click', () => {
      const input = document.getElementById('new-expense-category-input');
      const val = input.value.trim();
      if (!val) return;
      if (state.categories.expense.includes(val)) {
        showNotification('Category already exists.', 'error');
        return;
      }
      state.categories.expense.push(val);
      syncCategoriesToCloud();
      input.value = '';
      renderSettings();
      showNotification(`Added expense category: ${val}`, 'success');
    });

    document.getElementById('backup-data-btn').addEventListener('click', backupData);
    
    const fileInput = document.getElementById('restore-data-file-input');
    document.getElementById('restore-data-trigger-btn').addEventListener('click', () => {
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      if (this.files.length > 0) {
        restoreData(this.files[0]);
      }
    });

    document.getElementById('reset-data-btn').addEventListener('click', () => {
      if (confirm('CAUTION: This will delete ALL transactions, categories, budgets, and goals, and clear your database. Do you want to proceed?')) {
        state.transactions = [];
        state.budgets = {};
        state.goals = [];
        state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
        
        // Clean out cloud Collections
        if (currentUser) {
          const userRef = firestoreInstance.collection('users').doc(currentUser.uid);
          
          // Clear subcollections
          userRef.collection('transactions').get().then(snap => {
            snap.forEach(d => d.ref.delete());
          });
          userRef.collection('goals').get().then(snap => {
            snap.forEach(d => d.ref.delete());
          });

          // Reset settings docs
          userRef.collection('metadata').doc('categories').set(state.categories);
          userRef.collection('metadata').doc('budgets').set(state.budgets);
        }

        applyTheme();
        const currentActiveView = document.querySelector('.nav-item.active').getAttribute('data-view');
        triggerViewRender(currentActiveView);
        showNotification('Database cleared successfully.', 'warning');
      }
    });

    document.getElementById('reports-chart-year').addEventListener('change', renderReportsCharts);
    document.getElementById('reports-breakdown-month').addEventListener('change', renderReportsCharts);
  }

  function hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
      return r + r + g + g + b + b;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '59,130,246';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- App Initialization Loader ---
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial listener boots
    initNavigation();
    handlePagination();
    initEventListeners();
    initAuthFormHandlers();

    // 2. Boot Firebase with embedded config
    bootFirebaseApp();
  });

})();
