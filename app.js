// Portail Unifié - Billard & Équitation
console.log("Portail Unifié : Démarrage du script...");

let supabaseClient = null;
let currentUser = null;
let drinks = [];
let settings = {};
let isLogin = true;
let inactivityTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM chargé, initialisation...");
    try {
        if (typeof supabase === 'undefined') {
            throw new Error("Le SDK Supabase n'est pas chargé. Vérifiez votre connexion internet.");
        }

        const SUPABASE_URL = "https://iwtuwtvgrocmxfkmidlk.supabase.co";
        const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHV3dHZncm9jbXhma21pZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNTM5NzUsImV4cCI6MjA5MzkyOTk3NX0.ISCfQxrD4dAnygL-teYon-KoJWrzDuTEHFZpe9tslmY";
        
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                storage: window.sessionStorage,
                persistSession: true
            }
        });
        window.supabaseClient = supabaseClient;
        console.log("Client Supabase initialisé.");

        await initAuth();
        initNavigation();
        initInactivityTracker();
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erreur fatale :", err);
        document.body.innerHTML = `<div style="padding: 2rem; color: red; font-family: sans-serif;">
            <h2>Erreur de chargement</h2>
            <p>${err.message}</p>
            <button onclick="location.reload()">Réessayer</button>
        </div>`;
    }
});

let isDataLoading = false;

// --- AUTHENTIFICATION ---
async function initAuth() {
    console.log("Initialisation Auth...");
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session && !currentUser) {
        handleSignIn(session.user);
    } else if (!session) {
        showView('login-view');
        toggleLoading(false);
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log("Auth State Change :", event);
        if (event === 'PASSWORD_RECOVERY' && session) {
            currentUser = session.user;
            showView('app-shell');
            // Ouvrir directement le modal de changement de mot de passe
            const changePassModal = document.getElementById('change-password-modal');
            if (changePassModal) {
                changePassModal.classList.remove('hidden');
                alert("🔑 Session de récupération activée. Veuillez saisir votre nouveau mot de passe ci-dessous pour réinitialiser votre accès.");
            }
            return;
        }
        if (event === 'SIGNED_IN' && session && !currentUser) {
            handleSignIn(session.user);
        }
        if (event === 'SIGNED_OUT') {
            handleSignOut();
        }
    });
    
    // ... reste du code initAuth

    // Toggle Sign In / Sign Up
    const toggleBtn = document.getElementById('auth-toggle-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    const submitBtn = document.getElementById('auth-submit-btn');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            isLogin = !isLogin;
            const pseudoGroup = document.querySelector('.id-pseudo-group');
            const pseudoInput = document.getElementById('login-pseudo');
            if (isLogin) {
                toggleText.textContent = "Pas encore de compte ?";
                toggleBtn.textContent = "S'inscrire";
                submitBtn.innerHTML = `Se Connecter <i data-lucide="arrow-right"></i>`;
                if (pseudoGroup) pseudoGroup.classList.add('hidden');
                if (pseudoInput) pseudoInput.removeAttribute('required');
            } else {
                toggleText.textContent = "Déjà un compte ?";
                toggleBtn.textContent = "Se connecter";
                submitBtn.innerHTML = `Créer un compte <i data-lucide="user-plus"></i>`;
                if (pseudoGroup) pseudoGroup.classList.remove('hidden');
                if (pseudoInput) pseudoInput.setAttribute('required', 'required');
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const pseudoInput = document.getElementById('login-pseudo');
        const pseudo = pseudoInput ? pseudoInput.value.trim() : "";

        toggleLoading(true);
        if (isLogin) {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) alert("Erreur : " + error.message);
        } else {
            if (!pseudo) {
                toggleLoading(false);
                return alert("Veuillez saisir un pseudo.");
            }
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: pseudo
                    }
                }
            });
            if (error) {
                alert("Erreur d'inscription : " + error.message);
            } else {
                if (data?.user) {
                    try {
                        await supabaseClient
                            .from('profiles')
                            .upsert({
                                id: data.user.id,
                                email: email,
                                full_name: pseudo,
                                role: 'member'
                            });
                    } catch (err) {
                        console.warn("Échec de l'upsert direct du profil (géré par trigger Supabase) :", err);
                    }
                }
                alert("Inscription réussie ! Vous pouvez maintenant vous connecter.");
            }
        }
        toggleLoading(false);
    });
}

function handleSignIn(user) {
    currentUser = user;
    showView('app-shell');
    loadAppData();
}

function handleSignOut() {
    currentUser = null;
    if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
    }
    showView('login-view');
}

// --- CONTROLE D'ACCES PAR ROLE & VERROUILLAGE D'INACTIVITE ---
function applyRoleAccessControl() {
    const role = currentUser?.profile?.role || 'member';
    
    const navHome = document.querySelector('.nav-menu li[data-section="home"]');
    const navTournaments = document.querySelector('.nav-menu li[data-section="tournaments"]');
    const navAdmin = document.querySelector('.nav-menu li[data-section="admin"]');
    
    if (role === 'admin') {
        if (navHome) navHome.style.display = '';
        if (navTournaments) navTournaments.style.display = '';
        if (navAdmin) navAdmin.style.display = '';
        
        switchSection('home');
    } else {
        if (navHome) navHome.style.display = 'none';
        if (navTournaments) navTournaments.style.display = 'none';
        if (navAdmin) navAdmin.style.display = 'none';
        
        // Les membres normaux sont strictement redirigés vers Gestion Club
        switchSection('management');
    }
}

function resetInactivityTimer() {
    if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
    }
    
    // Si aucun utilisateur n'est connecté, ou s'il s'agit d'un admin, aucun compte à rebours
    if (!currentUser || currentUser.profile?.role === 'admin') {
        return;
    }
    
    // Compte à rebours de 1 minute (60 000 ms) sans activité
    inactivityTimeout = setTimeout(async () => {
        console.log("Aucune activité depuis 1 minute. Déconnexion automatique de la session membre...");
        if (currentUser) {
            toggleLoading(true);
            try {
                await supabaseClient.auth.signOut();
                alert("Votre session a été verrouillée automatiquement après 1 minute d'inactivité.");
            } catch (err) {
                console.error("Erreur déconnexion inactivité :", err);
            } finally {
                toggleLoading(false);
            }
        }
    }, 60000);
}

function initInactivityTracker() {
    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
        document.addEventListener(event, resetInactivityTimer, { passive: true });
    });
}

// --- NAVIGATION ---
function initNavigation() {
    // Bouton de déconnexion
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm("Voulez-vous vraiment vous déconnecter ?")) {
                toggleLoading(true);
                const { error } = await supabaseClient.auth.signOut();
                toggleLoading(false);
                if (error) alert("Erreur lors de la déconnexion : " + error.message);
            }
        });
    }

    const navItems = document.querySelectorAll('.nav-menu li');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.getAttribute('data-section');
            switchSection(section);
        });
    });

    // Admin Tabs
    const adminTabs = document.querySelectorAll('.btn-tab');
    adminTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const paneId = tab.getAttribute('data-tab');
            document.querySelectorAll('.btn-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(paneId).classList.add('active');
        });
    });

    // Toggle Dropdown Profile Menu
    const profileTrigger = document.getElementById('user-profile-menu-trigger');
    const profileDropdown = document.getElementById('profile-dropdown');
    if (profileTrigger && profileDropdown) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('hidden');
        });
        
        // Fermer le dropdown en cliquant n'importe où
        document.addEventListener('click', () => {
            profileDropdown.classList.add('hidden');
        });
    }
    
    // Bind Profile Dropdown Buttons
    const btnChangePass = document.getElementById('dropdown-btn-change-password');
    if (btnChangePass) {
        btnChangePass.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.add('hidden');
            document.getElementById('change-password-modal').classList.remove('hidden');
        });
    }
    
    const btnLogoutDropdown = document.getElementById('dropdown-btn-logout');
    if (btnLogoutDropdown) {
        btnLogoutDropdown.addEventListener('click', async (e) => {
            e.stopPropagation();
            profileDropdown.classList.add('hidden');
            if (confirm("Voulez-vous vraiment vous déconnecter ?")) {
                toggleLoading(true);
                const { error } = await supabaseClient.auth.signOut();
                toggleLoading(false);
                if (error) alert("Erreur lors de la déconnexion : " + error.message);
            }
        });
    }

    // Modal Changement de Mot de Passe
    const cancelChangePassBtn = document.getElementById('cancel-change-password');
    const changePassModal = document.getElementById('change-password-modal');
    const changePassForm = document.getElementById('change-password-form');
    
    if (cancelChangePassBtn && changePassModal) {
        cancelChangePassBtn.addEventListener('click', () => {
            changePassModal.classList.add('hidden');
            if (changePassForm) changePassForm.reset();
        });
    }
    
    if (changePassForm) {
        changePassForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            
            if (newPassword !== confirmPassword) {
                return alert("❌ Les mots de passe ne correspondent pas.");
            }
            
            if (newPassword.length < 6) {
                return alert("❌ Le mot de passe doit contenir au moins 6 caractères.");
            }
            
            toggleLoading(true);
            try {
                const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
                if (error) {
                    alert("❌ Erreur : " + error.message);
                } else {
                    alert("✅ Votre mot de passe a été mis à jour avec succès !");
                    changePassModal.classList.add('hidden');
                    changePassForm.reset();
                }
            } catch (err) {
                alert("❌ Une erreur inattendue est survenue : " + err.message);
            } finally {
                toggleLoading(false);
            }
        });
    }

    // Modal Mot de passe oublié (Demande par E-mail)
    const forgotPassLink = document.getElementById('btn-forgot-password');
    const forgotPassModal = document.getElementById('forgot-password-modal');
    const cancelForgotPassBtn = document.getElementById('cancel-forgot-password');
    const forgotPassForm = document.getElementById('forgot-password-form');
    
    if (forgotPassLink && forgotPassModal) {
        forgotPassLink.addEventListener('click', (e) => {
            e.preventDefault();
            forgotPassModal.classList.remove('hidden');
        });
    }
    
    if (cancelForgotPassBtn && forgotPassModal) {
        cancelForgotPassBtn.addEventListener('click', () => {
            forgotPassModal.classList.add('hidden');
            if (forgotPassForm) forgotPassForm.reset();
        });
    }
    
    if (forgotPassForm) {
        forgotPassForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgot-email').value;
            
            toggleLoading(true);
            try {
                const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                    redirectTo: 'https://tessiers.github.io/MonClubBillard/'
                });
                
                if (error) {
                    alert("❌ Erreur : " + error.message);
                } else {
                    alert("📩 Un e-mail de réinitialisation a été envoyé ! Veuillez vérifier votre boîte de réception.");
                    forgotPassModal.classList.add('hidden');
                    forgotPassForm.reset();
                }
            } catch (err) {
                alert("❌ Une erreur est survenue : " + err.message);
            } finally {
                toggleLoading(false);
            }
        });
    }
}

function switchSection(name) {
    document.querySelectorAll('.nav-menu li').forEach(i => i.classList.remove('active'));
    document.querySelector(`.nav-menu li[data-section="${name}"]`).classList.add('active');

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`section-${name}`).classList.add('active');

    if (name === 'admin') loadAdminData();
    if (name === 'tournaments') initTournamentsModule();
}

// --- DATA LOADING ---
async function loadAppData() {
    toggleLoading(true);
    try {
        console.log("Chargement des données pour :", currentUser.id);
        
        // 1. Profil & Abonnements
        const { data: profile, error: profError } = await supabaseClient
            .from('profiles')
            .select('*, subscriptions(*, subscription_types(*))')
            .eq('id', currentUser.id)
            .single();
        
        if (profError) {
            console.warn("Profil non trouvé ou erreur:", profError.message);
            currentUser.profile = { 
                full_name: currentUser.email.split('@')[0], 
                role: 'member',
                subscriptions: [] 
            };
        } else {
            currentUser.profile = profile;
        }

        // Vérification de validité de l'abonnement pour les membres simples
        const role = currentUser.profile?.role || 'member';
        const subs = currentUser.profile?.subscriptions || [];
        const activeSub = subs.sort((a, b) => new Date(b.end_date) - new Date(a.end_date))[0];
        const todayStr = new Date().toISOString().split('T')[0];
        const isExpired = !activeSub || activeSub.end_date < todayStr;

        if (role !== 'admin' && isExpired) {
            document.getElementById('section-expired-interception').style.display = 'flex';
            document.getElementById('expired-sub-name').textContent = activeSub ? `Abonnement expiré : ${activeSub.subscription_types?.name || 'Standard'}` : "Aucun abonnement actif";
            document.getElementById('expired-sub-date').textContent = activeSub ? new Date(activeSub.end_date).toLocaleDateString() : 'Non renseignée';
            
            const expiredLogoutBtn = document.getElementById('btn-logout-expired');
            if (expiredLogoutBtn) {
                expiredLogoutBtn.onclick = async () => {
                    toggleLoading(true);
                    await supabaseClient.auth.signOut();
                    document.getElementById('section-expired-interception').style.display = 'none';
                    toggleLoading(false);
                };
            }
            toggleLoading(false);
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return; // Bloque le reste du chargement
        } else {
            document.getElementById('section-expired-interception').style.display = 'none';
        }

        // 2. Ardoise (Consommations non payées)
        const { data: consumptions, error: consError } = await supabaseClient
            .from('consumptions')
            .select('*')
            .eq('member_id', currentUser.id)
            .eq('is_paid', false);

        if (consError) console.error("Erreur consommations:", consError.message);
        currentUser.balance = consumptions?.reduce((acc, c) => acc + (c.price_at_time * (c.quantity || 1)), 0) || 0;

        // 3. Boissons
        const { data: drks, error: drkError } = await supabaseClient.from('drinks').select('*');
        if (drkError) console.error("Erreur boissons:", drkError.message);
        drinks = drks || [];
        initDrinkStocks();

        // 4. Rendu de l'interface
        renderManagementUI();
        
        // 5. Appliquer les droits d'accès par rôle & démarrer le verrouillage d'inactivité
        applyRoleAccessControl();
        resetInactivityTimer();
        
    } catch (err) {
        console.error("Erreur critique loadAppData:", err);
        alert("Une erreur est survenue lors du chargement : " + err.message);
    } finally {
        toggleLoading(false);
    }
}

// --- UI RENDERING (MANAGEMENT) ---
function renderManagementUI() {
    if (!currentUser) return;
    
    document.getElementById('user-name').textContent = currentUser.profile?.full_name || 'Membre';
    
    // Remplir le menu déroulant profil
    const dropName = document.getElementById('dropdown-user-name');
    const dropRole = document.getElementById('dropdown-user-role');
    if (dropName) dropName.textContent = currentUser.profile?.full_name || 'Membre';
    if (dropRole) dropRole.textContent = currentUser.profile?.role === 'admin' ? 'Administrateur' : 'Membre';
    
    document.getElementById('mem-balance').textContent = `${currentUser.balance.toFixed(2)}€`;
    
    const subs = currentUser.profile?.subscriptions || [];
    const activeSub = subs.sort((a, b) => new Date(b.end_date) - new Date(a.end_date))[0];
    
    const subTypeEl = document.getElementById('mem-sub-type');
    const subBadgeEl = document.getElementById('mem-sub-badge');
    const subEndDateEl = document.getElementById('mem-sub-end-date');

    if (activeSub) {
        subTypeEl.textContent = activeSub.subscription_types?.name || 'Standard';
        const isExpired = new Date(activeSub.end_date) < new Date();
        subBadgeEl.textContent = isExpired ? 'Expiré' : 'Actif';
        subBadgeEl.className = isExpired ? 'value danger' : 'value success';
        if (subEndDateEl) subEndDateEl.textContent = new Date(activeSub.end_date).toLocaleDateString();
    } else {
        subTypeEl.textContent = 'Aucun';
        subBadgeEl.textContent = 'Inactif';
        subBadgeEl.className = 'value danger';
        if (subEndDateEl) subEndDateEl.textContent = 'Expiré';
    }

    // Drinks List
    const drinkList = document.getElementById('drinks-list');
    drinkList.innerHTML = drinks.map(d => {
        const visual = d.image_url 
            ? `<img src="${d.image_url}" alt="${d.name}" class="drink-image">`
            : `<i data-lucide="${d.icon || 'glass-water'}"></i>`;
        
        const stock = d.stock ?? 20;
        let stockBadge = '';
        let itemStyle = '';
        
        if (stock === 0) {
            stockBadge = `<span style="font-size: 0.75rem; background: rgba(220, 53, 69, 0.2); color: #ff4d4d; border: 1px solid rgba(220, 53, 69, 0.4); padding: 2px 6px; border-radius: 8px;">Rupture</span>`;
            itemStyle = 'opacity: 0.5; filter: grayscale(1); cursor: not-allowed;';
        } else if (stock < 5) {
            stockBadge = `<span style="font-size: 0.75rem; background: rgba(255, 193, 7, 0.2); color: var(--accent-gold); border: 1px solid rgba(255, 193, 7, 0.4); padding: 2px 6px; border-radius: 8px;">${stock} restants</span>`;
        } else {
            stockBadge = `<span style="font-size: 0.75rem; background: rgba(40, 167, 69, 0.1); color: var(--accent-green); border: 1px solid rgba(40, 167, 69, 0.2); padding: 2px 6px; border-radius: 8px;">En stock</span>`;
        }
            
        return `
        <div class="drink-item" onclick="logConsumption(${d.id}, '${d.name}', ${d.price})" style="${itemStyle} position: relative;">
            <div style="position: absolute; top: 8px; right: 8px;">${stockBadge}</div>
            ${visual}
            <span>${d.name}</span>
            <span class="drink-price">${d.price}€</span>
        </div>
        `;
    }).join('');

    // History
    loadHistory();
    lucide.createIcons();
}

async function loadHistory() {
    const { data: hist } = await supabaseClient
        .from('consumptions')
        .select('*, drinks(name)')
        .eq('member_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(10);

    const histBody = document.getElementById('history-list');
    histBody.innerHTML = hist?.map(h => `
        <tr>
            <td>${new Date(h.created_at).toLocaleDateString()}</td>
            <td>${h.drinks?.name || 'Article'}</td>
            <td>${h.price_at_time}€</td>
            <td class="${h.is_paid ? 'success' : 'danger'}">${h.is_paid ? 'Payé' : 'À régler'}</td>
        </tr>
    `).join('') || '';
}

async function logConsumption(id, name, price) {
    // VÉRIFICATION DU STOCK
    const drink = drinks.find(d => d.id === id);
    if (drink && drink.stock !== undefined && drink.stock !== null && drink.stock <= 0) {
        alert(`Désolé, la boisson "${name}" est en rupture de stock !`);
        return;
    }

    if (!confirm(`Confirmer : ${name} (${price}€) ?`)) return;

    toggleLoading(true);
    const { error } = await supabaseClient.from('consumptions').insert({
        member_id: currentUser.id,
        drink_id: id,
        price_at_time: price
    });
    toggleLoading(false);

    if (error) alert(error.message);
    else {
        // Décrémenter le stock de 1
        if (drink) {
            const currentStock = drink.stock || 0;
            const newStock = Math.max(0, currentStock - 1);
            await updateDrinkStock(id, newStock, 'Retrait (Club)', 1, 'Portail Club', `Consommé par ${currentUser.profile?.full_name || 'Membre'}`);
        }
        loadAppData();
    }
}

// --- ADMIN LOGIC ---
// Sera remplacé par la vraie logique

// --- UTILS ---
function showView(id) {
    const loginView = document.getElementById('login-view');
    const appShell = document.getElementById('app-shell');
    const target = document.getElementById(id);

    if (loginView) loginView.classList.add('hidden');
    if (appShell) appShell.classList.add('hidden');
    if (target) target.classList.remove('hidden');
}

function toggleLoading(show) {
    const el = document.getElementById('loading');
    if (!el) return;
    
    if (show) {
        el.classList.remove('hidden');
        // Sécurité : au bout de 5s on cache quoi qu'il arrive
        setTimeout(() => el.classList.add('hidden'), 5000);
    } else {
        el.classList.add('hidden');
    }
}

// --- ADMIN HELPERS ---
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function closeModal(id) { hide(id); }

let editingDrinkId = null;
let editingSubTypeId = null;

    // Fonction globale pour ouvrir le modal d'abonnement pré-rempli pour un membre existant
    async function openSubscriptionFor(fullName, email) {
      if (!email) {
        alert("Impossible de modifier l'abonnement de ce membre car il n'a pas d'adresse e-mail renseignée.");
        return;
      }
      
      // 1. Charger les types d'abonnements si non présents en cache
      if (!window.cachedSubTypes || window.cachedSubTypes.length === 0) {
        const { data: types } = await supabaseClient.from('subscription_types').select('*');
        window.cachedSubTypes = types || [];
      }
      
      const select = document.getElementById('manual-mem-type');
      select.innerHTML = window.cachedSubTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

      // 2. Pré-remplir les champs dans la modale
      document.getElementById('manual-mem-name').value = fullName;
      document.getElementById('manual-mem-email').value = email;

      // 3. Charger le dossier d'abonnement importé existant
      show('loading');
      try {
        const { data: existing } = await supabaseClient
          .from('imported_members')
          .select('*')
          .eq('email', email.trim().toLowerCase())
          .maybeSingle();
        window.existingMemberRecord = existing || null;
        
        // 4. Calculer dynamiquement la date de fin et afficher
        updateCalculatedEndDate();
        
        // Personnaliser le titre du modal pour indiquer l'édition
        document.querySelector('#member-modal h3').textContent = "Prolonger / Modifier l'Abonnement";
        
        show('member-modal');
      } catch (err) {
        console.error("Erreur lors du chargement des données d'abonnement:", err);
        alert("Erreur lors de la récupération des données.");
      } finally {
        hide('loading');
      }
    }
    window.openSubscriptionFor = openSubscriptionFor;

    async function loadAdminData() {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Unified Members Fetch
      const { data: mems } = await supabaseClient.from('profiles').select('*, subscriptions(*, subscription_types(*)), consumptions(*)').order('full_name');
      
      // Remplir l'onglet Consommations / Ardoises
      const consBody = document.getElementById('admin-consumption-list');
      if (consBody) {
        consBody.innerHTML = '';
        mems?.forEach(m => {
          const unpaidCons = m.consumptions?.filter(c => !c.is_paid) || [];
          const balance = unpaidCons.reduce((acc, c) => acc + (c.price_at_time * (c.quantity || 1)), 0);
          const lastSub = m.subscriptions?.sort((a, b) => new Date(b.end_date) - new Date(a.end_date))[0];
          
          let subStatus = '<span class="badge badge-expired" style="font-size:0.7rem;">Aucun</span>';
          if (lastSub) {
            const isExpired = new Date(lastSub.end_date) < new Date();
            subStatus = isExpired 
              ? `<span class="badge badge-expired" style="font-size:0.7rem;">Expiré (${new Date(lastSub.end_date).toLocaleDateString()})</span>`
              : `<span class="badge badge-active" style="font-size:0.7rem;">Actif (${new Date(lastSub.end_date).toLocaleDateString()})</span>`;
          }

          const row = document.createElement('tr');
          if (balance > 0) {
            row.className = 'unpaid-slate-row';
          }
          
          const safeName = m.full_name.replace(/'/g, "\\'");
          
          row.innerHTML = `
            <td>
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:32px; height:32px; border-radius:50%; background:rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); display:flex; align-items:center; justify-content:center; font-weight:bold; color:#22c55e;">
                  ${m.full_name.charAt(0).toUpperCase()}
                </div>
                <span>${m.full_name}</span>
              </div>
            </td>
            <td style="font-size: 0.85rem;">${m.email || '<span class="text-muted">(non renseigné)</span>'}</td>
            <td>${subStatus}</td>
            <td class="${balance > 0 ? 'slate-due-high' : ''}">${balance.toFixed(2)}€</td>
            <td>
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-outline" style="padding:4px 8px; font-size:0.8rem;" title="Historique & Détails" onclick="openMemberConsumptionDetails('${m.id}', '${safeName}')">
                  <i data-lucide="eye" style="width:14px; height:14px; vertical-align:middle; margin-right:4px;"></i> Détails
                </button>
                ${balance > 0 ? `<button class="btn btn-outline" style="border-color:#22c55e; color:#22c55e; padding:4px 8px; font-size:0.8rem;" title="Encaisser l'ardoise" onclick="clearMemberBalance('${m.id}')"><i data-lucide="check-circle" style="width:14px; height:14px; vertical-align:middle; margin-right:4px;"></i> Encaisser</button>` : ''}
              </div>
            </td>
          `;
          consBody.appendChild(row);
        });
      }

      // Connecter le filtrage de recherche pour les consommations
      const searchInput = document.getElementById('consumption-search-input');
      if (searchInput) {
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        
        newSearchInput.addEventListener('input', (e) => {
          const query = e.target.value.toLowerCase().trim();
          const rows = document.querySelectorAll('#admin-consumption-list tr');
          rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
          });
        });
      }

      const body = document.getElementById('admin-member-list');
      body.innerHTML = '';
      mems?.forEach(m => {
        const lastSub = m.subscriptions?.sort((a, b) => new Date(b.end_date) - new Date(a.end_date))[0];
        const unpaidCons = m.consumptions?.filter(c => !c.is_paid) || [];
        const balance = unpaidCons.reduce((acc, c) => acc + (c.price_at_time * (c.quantity || 1)), 0);

        const j4Date = new Date();
        j4Date.setDate(j4Date.getDate() + 4);
        const j4Str = j4Date.toISOString().split('T')[0];

        const isExpired = lastSub && lastSub.end_date < todayStr;
        const isJ4 = lastSub && lastSub.end_date === j4Str;

        const row = document.createElement('tr');
        const safeName = m.full_name.replace(/'/g, "\\'");
        const safeEmail = (m.email || '').replace(/'/g, "\\'");

        row.innerHTML = `
          <td class="clickable-cell" title="Modifier l'abonnement" onclick="openSubscriptionFor('${safeName}', '${safeEmail}')">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-weight:600;">${m.full_name}</span>
              <button class="btn btn-outline" style="padding:2px 6px; font-size:0.75rem; border:none; background:transparent;" title="Modifier le pseudo" onclick="event.stopPropagation(); editMemberPseudo('${m.id}', '${safeName}')">
                <i data-lucide="pencil" style="width:12px; height:12px;"></i>
              </button>
            </div>
            ${m.role === 'admin' ? '<span class="badge badge-active" style="font-size:0.6rem; padding: 0.1rem 0.3rem; margin-top:2px; display:inline-block;">ADMIN</span>' : ''}
          </td>
          <td class="clickable-cell" title="Modifier l'abonnement" style="font-size: 0.85rem;" onclick="openSubscriptionFor('${safeName}', '${safeEmail}')">
            ${m.email || '<span class="text-muted">(non renseigné)</span>'}
          </td>
          <td class="clickable-cell" title="Modifier l'abonnement" onclick="openSubscriptionFor('${safeName}', '${safeEmail}')">
            <span class="badge badge-active" style="font-size: 0.7rem;">Inscrit</span>
          </td>
          <td class="clickable-cell" title="Modifier l'abonnement" onclick="openSubscriptionFor('${safeName}', '${safeEmail}')">
            ${lastSub ? lastSub.subscription_types.name : '<span class="text-muted">Aucun</span>'}
          </td>
          <td class="clickable-cell ${isExpired ? 'text-danger font-bold' : (isJ4 ? 'text-warning font-bold' : 'text-success font-bold')}" title="Modifier l'abonnement" onclick="openSubscriptionFor('${safeName}', '${safeEmail}')">
            ${lastSub ? new Date(lastSub.end_date).toLocaleDateString() : '-'}
          </td>
          <td class="${balance > 0 ? 'text-danger font-bold' : ''}">${balance.toFixed(2)}€</td>
          <td>
            <div style="display: flex; gap: 0.5rem;">
              ${balance > 0 ? `<button class="btn btn-outline" title="Encaisser" onclick="clearMemberBalance('${m.id}')"><i data-lucide="check-circle"></i></button>` : ''}
              <button class="btn btn-outline" title="${m.role === 'admin' ? 'Rétrograder en membre simple' : 'Promouvoir Admin'}" onclick="toggleAdminRole('${m.id}', '${m.role}')">
                <i data-lucide="${m.role === 'admin' ? 'shield-off' : 'shield'}" style="width: 16px; height: 16px;"></i>
              </button>
              <button class="btn btn-outline btn-danger" title="Supprimer le profil" onclick="deleteProfile('${m.id}')"><i data-lucide="user-minus"></i></button>
            </div>
          </td>
        `;
        body.appendChild(row);
      });

      // 2. Charger les imports en attente (ceux qui n'ont PAS encore de compte)
      const { data: pending } = await supabaseClient.from('imported_members').select('*, subscription_types(*)').order('created_at', { ascending: false });
      // const pBody = document.getElementById('admin-pending-list');
      // pBody.innerHTML = '';

      // Filtrer pour ne garder que ceux qui ne sont pas encore dans 'profiles'
      const existingEmails = new Set(mems?.map(m => (m.email || '').toLowerCase()).filter(e => e));
      const filteredPending = pending?.filter(p => !existingEmails.has(p.email.toLowerCase())) || [];

      filteredPending.forEach(p => {
        const j4Date = new Date();
        j4Date.setDate(j4Date.getDate() + 4);
        const j4Str = j4Date.toISOString().split('T')[0];

        const isExpired = p.subscription_end_date && p.subscription_end_date < todayStr;
        const isJ4 = p.subscription_end_date && p.subscription_end_date === j4Str;

        const row = document.createElement('tr');
        const safeName = p.full_name.replace(/'/g, "\\'");
        const safeEmail = p.email.replace(/'/g, "\\'");

        row.innerHTML = `
          <td class="clickable-cell" title="Modifier l'abonnement" onclick="openSubscriptionFor('${safeName}', '${safeEmail}')">${p.full_name}</td>
          <td class="clickable-cell" title="Modifier l'abonnement" style="font-size: 0.85rem;" onclick="openSubscriptionFor('${safeName}', '${safeEmail}')">${p.email}</td>
          <td class="clickable-cell" title="Modifier l'abonnement" onclick="openSubscriptionFor('${safeName}', '${safeEmail}')">
            <span class="badge badge-expired" style="font-size: 0.7rem;">En attente</span>
          </td>
          <td class="clickable-cell" title="Modifier l'abonnement" onclick="openSubscriptionFor('${safeName}', '${safeEmail}')">
            ${p.subscription_types?.name || 'Inconnu'}
          </td>
          <td class="clickable-cell ${isExpired ? 'text-danger font-bold' : (isJ4 ? 'text-warning font-bold' : 'text-success font-bold')}" title="Modifier l'abonnement" onclick="openSubscriptionFor('${safeName}', '${safeEmail}')">
            ${p.subscription_end_date ? new Date(p.subscription_end_date).toLocaleDateString() : '-'}
          </td>
          <td>0.00€</td>
          <td>
            <button class="btn btn-outline btn-danger" title="Supprimer l'import" onclick="deletePendingImport(${p.id})">
              <i data-lucide="trash-2" size="16"></i>
            </button>
          </td>
        `;
        body.appendChild(row);
      });

      // Remplir la liste d'autocomplétion des membres uniques (Nom - Email)
      const allMembersMap = new Map();
      pending?.forEach(p => {
        if (p.email && p.full_name) {
          allMembersMap.set(p.email.toLowerCase().trim(), {
            full_name: p.full_name,
            email: p.email
          });
        }
      });
      mems?.forEach(m => {
        if (m.email && m.full_name) {
          allMembersMap.set(m.email.toLowerCase().trim(), {
            full_name: m.full_name,
            email: m.email
          });
        }
      });
      window.allMembersList = Array.from(allMembersMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));

      const datalist = document.getElementById('members-datalist');
      if (datalist) {
        datalist.innerHTML = window.allMembersList.map(m => 
          `<option value="${m.full_name}">${m.email}</option>`
        ).join('');
      }

      // 3. Charger le reste (boissons, types d'abonnements)
      const dBody = document.getElementById('admin-drink-list');
      dBody.innerHTML = '';
      drinks.forEach(d => {
        const row = document.createElement('tr');
        const preview = d.image_url ? `<img src="${d.image_url}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;" title="${d.image_url}" alt="">` : `<i data-lucide="${d.icon}"></i>`;
        const link = d.image_url ? `<a href="${d.image_url}" target="_blank" style="font-size: 0.7rem; color: var(--primary); display: block;">Voir</a>` : '';
        row.innerHTML = `
          <td>${preview}${link}</td>
          <td>${d.name}</td>
          <td>${d.price}€</td>
          <td>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-outline" onclick="editDrink(${d.id})"><i data-lucide="pencil" size="16"></i></button>
              <button class="btn btn-outline btn-danger" onclick="deleteDrink(${d.id})"><i data-lucide="trash" size="16"></i></button>
            </div>
          </td>
        `;
        dBody.appendChild(row);
      });

      const { data: sTypes } = await supabaseClient.from('subscription_types').select('*');
      const sBody = document.getElementById('admin-subtype-list');
      sBody.innerHTML = '';
      sTypes?.forEach(t => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${t.name}</td>
          <td>${t.duration_days}j</td>
          <td>${t.price}€</td>
          <td>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-outline" onclick="editSubType(${t.id})"><i data-lucide="pencil" size="16"></i></button>
              <button class="btn btn-outline btn-danger" onclick="deleteSubType(${t.id})"><i data-lucide="trash" size="16"></i></button>
            </div>
          </td>
        `;
        sBody.appendChild(row);
      });
      renderStockDashboard();
      lucide.createIcons();
    }

    async function deletePendingImport(id) {
      if (!confirm("Supprimer cet import ? Le membre ne pourra plus récupérer son abonnement automatiquement à la création de son compte.")) return;
      const { error } = await supabaseClient.from('imported_members').delete().eq('id', id);
      if (error) alert("Erreur: " + error.message);
      else loadAdminData();
    }

    async function deleteProfile(id) {
      if (!confirm("Supprimer ce profil membre ? Attention: cela ne supprime pas son compte Auth s'il existe, mais il perdra tout son historique et son rôle.")) return;
      const { error } = await supabaseClient.from('profiles').delete().eq('id', id);
      if (error) alert("Erreur: " + error.message);
      else loadAdminData();
    }

    async function toggleAdminRole(profileId, currentRole) {
      const newRole = currentRole === 'admin' ? 'member' : 'admin';
      const actionText = newRole === 'admin' ? 'promouvoir ce membre comme Administrateur' : 'rétrograder cet administrateur en membre simple';
      
      if (!confirm(`Voulez-vous vraiment ${actionText} ?`)) return;
      
      show('loading');
      const { error } = await supabaseClient
        .from('profiles')
        .update({ role: newRole })
        .eq('id', profileId);
      
      hide('loading');
      if (error) alert("Erreur: " + error.message);
      else {
        alert("Rôle mis à jour avec succès !");
        loadAdminData();
      }
    }

    async function editMemberPseudo(profileId, currentPseudo) {
      const newPseudo = prompt("Modifier le pseudo du membre :", currentPseudo);
      if (newPseudo === null) return;
      const trimmed = newPseudo.trim();
      if (!trimmed) return alert("Le pseudo ne peut pas être vide.");

      show('loading');
      const { error } = await supabaseClient
        .from('profiles')
        .update({ full_name: trimmed })
        .eq('id', profileId);

      hide('loading');
      if (error) {
        alert("Erreur lors de la modification du pseudo : " + error.message);
      } else {
        alert("Pseudo mis à jour avec succès !");
        loadAdminData();
      }
    }
    window.editMemberPseudo = editMemberPseudo;

    // --- NOUVEAU MEMBRE & PROLONGATION ---
    window.cachedSubTypes = [];
    window.existingMemberRecord = null;

    function updateCalculatedEndDate() {
      const typeId = document.getElementById('manual-mem-type').value;
      if (!typeId || !window.cachedSubTypes || window.cachedSubTypes.length === 0) return;
      
      const selectedType = window.cachedSubTypes.find(t => t.id.toString() === typeId.toString());
      if (!selectedType) return;
      
      const duration = parseInt(selectedType.duration_days) || 365;
      
      let baseDate = new Date();
      let isProlongation = false;
      
      if (window.existingMemberRecord && window.existingMemberRecord.subscription_end_date) {
        const currentEnd = new Date(window.existingMemberRecord.subscription_end_date);
        const today = new Date();
        today.setHours(0,0,0,0);
        currentEnd.setHours(0,0,0,0);
        
        if (currentEnd >= today) {
          baseDate = new Date(window.existingMemberRecord.subscription_end_date);
          isProlongation = true;
        }
      }
      
      // Ajouter la durée de l'abonnement choisi
      baseDate.setDate(baseDate.getDate() + duration);
      
      // Formater en YYYY-MM-DD
      document.getElementById('manual-mem-end-date').value = baseDate.toISOString().split('T')[0];
      
      // Mettre à jour l'aide textuelle dans la modale
      const helpEl = document.querySelector('#member-modal .help');
      if (helpEl) {
        if (window.existingMemberRecord) {
          if (isProlongation) {
            helpEl.innerHTML = `⚠️ <strong style="color:#ef4444;">Membre existant détecté !</strong> Son abonnement actuel se termine le <strong>${new Date(window.existingMemberRecord.subscription_end_date).toLocaleDateString()}</strong>. La prolongation démarrera le lendemain et ira jusqu'au <strong>${baseDate.toLocaleDateString()}</strong>.`;
          } else {
            helpEl.innerHTML = `⚠️ <strong style="color:#ef4444;">Membre existant détecté !</strong> Son abonnement est expiré. Le nouvel abonnement démarrera aujourd'hui et ira jusqu'au <strong>${baseDate.toLocaleDateString()}</strong>.`;
          }
          document.getElementById('save-manual-member-btn').textContent = "Prolonger / Mettre à jour";
        } else {
          helpEl.innerHTML = `Ce membre n'aura pas encore de compte utilisateur complet tant qu'il ne se sera pas inscrit avec ce même e-mail. L'abonnement ira jusqu'au <strong>${baseDate.toLocaleDateString()}</strong>.`;
          document.getElementById('save-manual-member-btn').textContent = "Pré-enregistrer";
        }
      }
    }

    // Écouteur sur la saisie du nom pour l'autocomplétion intelligente
    document.getElementById('manual-mem-name').addEventListener('input', async (e) => {
      const name = e.target.value.trim();
      if (name && window.allMembersList) {
        // Recherche insensible à la casse d'un membre existant
        const match = window.allMembersList.find(m => m.full_name.trim().toLowerCase() === name.toLowerCase());
        if (match && match.email) {
          document.getElementById('manual-mem-email').value = match.email;
          
          // Récupère immédiatement son dossier d'abonnement importé
          show('loading');
          try {
            const { data: existing } = await supabaseClient
              .from('imported_members')
              .select('*')
              .eq('email', match.email.trim().toLowerCase())
              .maybeSingle();
            window.existingMemberRecord = existing || null;
            updateCalculatedEndDate();
          } catch (err) {
            console.error("Erreur lors de la récupération du membre:", err);
          } finally {
            hide('loading');
          }
        }
      }
    });

    // Écouteurs sur la saisie de l'email et le choix du type
    document.getElementById('manual-mem-email').addEventListener('blur', async () => {
      const email = document.getElementById('manual-mem-email').value.trim().toLowerCase();
      if (email) {
        const { data: existing } = await supabaseClient
          .from('imported_members')
          .select('*')
          .eq('email', email)
          .maybeSingle();
        window.existingMemberRecord = existing || null;
        if (existing) {
          if (!document.getElementById('manual-mem-name').value) {
            document.getElementById('manual-mem-name').value = existing.full_name || '';
          }
        }
      } else {
        window.existingMemberRecord = null;
      }
      updateCalculatedEndDate();
    });

    document.getElementById('manual-mem-type').addEventListener('change', () => {
      updateCalculatedEndDate();
    });

    // Modal Nouveau Membre
    document.getElementById('add-member-btn').addEventListener('click', async () => {
      const { data: types } = await supabaseClient.from('subscription_types').select('*');
      window.cachedSubTypes = types || [];
      
      const select = document.getElementById('manual-mem-type');
      select.innerHTML = types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

      document.getElementById('manual-mem-name').value = '';
      document.getElementById('manual-mem-email').value = '';
      window.existingMemberRecord = null;

      // Réinitialiser le titre par défaut du modal
      const modalTitle = document.querySelector('#member-modal h3');
      if (modalTitle) modalTitle.textContent = "Ajouter un Membre Manuellement";

      updateCalculatedEndDate();
      show('member-modal');
    });

    document.getElementById('save-manual-member-btn').addEventListener('click', async () => {
      const name = document.getElementById('manual-mem-name').value.trim();
      const email = document.getElementById('manual-mem-email').value.trim().toLowerCase();
      const typeId = document.getElementById('manual-mem-type').value;
      const endDate = document.getElementById('manual-mem-end-date').value;

      if (!name || !email || !endDate) return alert("Tous les champs sont requis.");

      show('loading');

      // Double-check de l'existence par précaution
      const { data: existing } = await supabaseClient
        .from('imported_members')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      let isNew = !existing;
      let startDateStr = new Date().toISOString().split('T')[0];

      if (existing) {
        if (existing.subscription_end_date) {
          const currentEnd = new Date(existing.subscription_end_date);
          const today = new Date();
          today.setHours(0,0,0,0);
          currentEnd.setHours(0,0,0,0);
          
          if (currentEnd >= today) {
            const nextDay = new Date(existing.subscription_end_date);
            nextDay.setDate(nextDay.getDate() + 1);
            startDateStr = nextDay.toISOString().split('T')[0];
          }
        }
      }

      const record = {
        full_name: name,
        email: email,
        subscription_type_id: typeId,
        subscription_end_date: endDate,
        subscription_start_date: startDateStr
      };

      const { error } = await supabaseClient.from('imported_members').upsert(record, { onConflict: 'email' });

      if (!error) {
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (profile) {
          await supabaseClient.from('subscriptions').insert({
            member_id: profile.id,
            type_id: typeId,
            start_date: startDateStr,
            end_date: endDate
          });
        }
      }

      hide('loading');
      if (error) alert("Erreur: " + error.message);
      else {
        if (isNew) {
          alert("Nouveau membre pré-enregistré avec succès !");
        } else {
          alert("Abonnement prolongé / mis à jour avec succès !");
        }
        closeModal('member-modal');
        loadAdminData();
      }
    });



    async function clearMemberBalance(memberId) {
      if (!confirm("Marquer TOUTE l'ardoise comme payée pour ce membre ?")) return;

      show('loading');
      const { error } = await supabaseClient
        .from('consumptions')
        .update({ is_paid: true })
        .eq('member_id', memberId)
        .eq('is_paid', false);

      hide('loading');
      if (error) alert("Erreur: " + error.message);
      else {
        alert("Ardoise effacée !");
        loadAdminData();
        if (memberId === currentUser.id) loadAppData(true);
      }
    }

    async function openMemberConsumptionDetails(memberId, memberName) {
      show('loading');
      try {
        const { data: consumptions, error } = await supabaseClient
          .from('consumptions')
          .select('*, drinks(name)')
          .eq('member_id', memberId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const unpaidList = consumptions?.filter(c => !c.is_paid) || [];
        const paidList = consumptions?.filter(c => c.is_paid) || [];

        const totalDue = unpaidList.reduce((acc, c) => acc + (c.price_at_time * (c.quantity || 1)), 0);

        document.getElementById('consumption-detail-title').innerHTML = `<i data-lucide="coffee" style="width:20px;height:20px;vertical-align:middle;margin-right:6px;"></i> Consommations de <strong>${memberName}</strong>`;
        document.getElementById('detail-total-due').textContent = `${totalDue.toFixed(2)}€`;

        const unpaidBody = document.getElementById('detail-unpaid-list');
        if (unpaidList.length === 0) {
          unpaidBody.innerHTML = `<tr><td colspan="3" class="text-muted" style="text-align:center;">Aucune boisson en ardoise.</td></tr>`;
        } else {
          unpaidBody.innerHTML = unpaidList.map(c => `
            <tr>
              <td>${new Date(c.created_at).toLocaleDateString()}</td>
              <td>${c.drinks?.name || 'Article'}</td>
              <td class="text-danger" style="font-weight:600;">${c.price_at_time.toFixed(2)}€</td>
            </tr>
          `).join('');
        }

        const paidBody = document.getElementById('detail-paid-list');
        if (paidList.length === 0) {
          paidBody.innerHTML = `<tr><td colspan="3" class="text-muted" style="text-align:center;">Aucun historique de règlement.</td></tr>`;
        } else {
          paidBody.innerHTML = paidList.map(c => `
            <tr>
              <td>${new Date(c.created_at).toLocaleDateString()}</td>
              <td>${c.drinks?.name || 'Article'}</td>
              <td class="text-success" style="font-weight:600;">${c.price_at_time.toFixed(2)}€</td>
            </tr>
          `).join('');
        }

        const collectBtn = document.getElementById('btn-collect-tab');
        if (totalDue > 0) {
          collectBtn.style.display = '';
          collectBtn.onclick = async () => {
            document.getElementById('consumption-detail-modal').classList.add('hidden');
            await clearMemberBalance(memberId);
            openMemberConsumptionDetails(memberId, memberName);
          };
        } else {
          collectBtn.style.display = 'none';
        }

        hide('loading');
        document.getElementById('consumption-detail-modal').classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();

      } catch (err) {
        console.error("Erreur lors du chargement des détails de consommation :", err);
        alert("Erreur technique : " + err.message);
        hide('loading');
      }
    }
    window.openMemberConsumptionDetails = openMemberConsumptionDetails;

    async function uploadToSupabase(file) {
      if (!supabaseClient) return null;
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `drink_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
        const filePath = `drinks/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from('images')
          .upload(filePath, file);

        if (uploadError) {
          console.error("Erreur d'upload Supabase:", uploadError.message);
          alert("Erreur d'envoi Supabase : " + uploadError.message + "\n\n(Vérifiez que le bucket 'images' est bien PUBLIC et que les règles RLS autorisent l'upload).");
          return null;
        }

        const { data } = supabaseClient.storage
          .from('images')
          .getPublicUrl(filePath);

        return data?.publicUrl || null;
      } catch (err) {
        console.error("Erreur uploadToSupabase:", err); alert("Erreur technique d'envoi : " + err.message);
        return null;
      }
    }

    // Drink CRUD
    document.getElementById('add-drink-btn').addEventListener('click', () => {
      editingDrinkId = null;
      document.getElementById('drink-modal-title').textContent = "Ajouter une boisson";
      document.getElementById('drink-name').value = '';
      document.getElementById('drink-price').value = '';
      document.getElementById('drink-icon').value = 'cup-soda';
      document.getElementById('drink-image-url').value = '';
      document.getElementById('drink-image-file').value = '';
      show('drink-modal');
    });

    function editDrink(id) {
      const drink = drinks.find(d => d.id === id);
      if (!drink) return;

      editingDrinkId = id;
      document.getElementById('drink-modal-title').textContent = "Modifier la boisson";
      document.getElementById('drink-name').value = drink.name;
      document.getElementById('drink-price').value = drink.price;
      document.getElementById('drink-icon').value = drink.icon || 'cup-soda';
      document.getElementById('drink-image-url').value = drink.image_url || '';
      document.getElementById('drink-image-file').value = '';
      show('drink-modal');
      lucide.createIcons();
    }

    document.getElementById('save-drink-btn').addEventListener('click', async () => { try {
      const name = document.getElementById('drink-name').value;
      const price = document.getElementById('drink-price').value;
      const icon = document.getElementById('drink-icon').value;
      let image_url = document.getElementById('drink-image-url').value;
      const imageFile = document.getElementById('drink-image-file').files[0];

      if (!name || !price) return alert("Nom et prix sont requis.");

      show('loading');
      if (imageFile) {
        const uploadedUrl = await uploadToSupabase(imageFile);
        if (uploadedUrl) image_url = uploadedUrl;
      }

      const drinkData = { name, price: parseFloat(price), icon, image_url };

      let res;
      if (editingDrinkId) {
        res = await supabaseClient.from('drinks').update(drinkData).eq('id', editingDrinkId);
      } else {
        res = await supabaseClient.from('drinks').insert(drinkData);
      }

      hide('loading');
      if (res && res.error) alert("Erreur de sauvegarde: " + res.error.message);
      else {
        closeModal('drink-modal');
        loadAppData();
        loadAdminData();
      }
      } catch (err) { hide('loading'); alert("Erreur générale: " + err.message); } });

    async function deleteDrink(id) {
      if (!confirm("Supprimer cette boisson ?")) return;
      const { error } = await supabaseClient.from('drinks').delete().eq('id', id);
      if (error) alert("Erreur: " + error.message);
      else {
        loadAppData();
        loadAdminData();
      }
    }

    // Sub Types Logic
    document.getElementById('add-subtype-btn').addEventListener('click', () => {
      editingSubTypeId = null;
      document.getElementById('subtype-modal-title').textContent = "Ajouter un type d'abonnement";
      document.getElementById('subtype-name').value = '';
      document.getElementById('subtype-duration').value = '';
      document.getElementById('subtype-price').value = '';
      show('subtype-modal');
    });

    async function editSubType(id) {
      show('loading');
      const { data: type, error } = await supabaseClient.from('subscription_types').select('*').eq('id', id).single();
      hide('loading');

      if (error) return alert("Erreur: " + error.message);

      editingSubTypeId = id;
      document.getElementById('subtype-modal-title').textContent = "Modifier le type d'abonnement";
      document.getElementById('subtype-name').value = type.name;
      document.getElementById('subtype-duration').value = type.duration_days;
      document.getElementById('subtype-price').value = type.price;
      show('subtype-modal');
    }

    document.getElementById('save-subtype-btn').addEventListener('click', async () => {
      const name = document.getElementById('subtype-name').value;
      const duration = document.getElementById('subtype-duration').value;
      const price = document.getElementById('subtype-price').value;

      if (!name || !duration || !price) return alert("Tous les champs sont requis.");

      const subData = { name, duration_days: parseInt(duration), price: parseFloat(price) };

      show('loading');
      let res;
      if (editingSubTypeId) {
        res = await supabaseClient.from('subscription_types').update(subData).eq('id', editingSubTypeId);
      } else {
        res = await supabaseClient.from('subscription_types').insert(subData);
      }
      hide('loading');

      if (res.error) alert("Erreur: " + res.error.message);
      else {
        closeModal('subtype-modal');
        loadAdminData();
      }
    });

    async function deleteSubType(id) {
      if (!confirm("Supprimer ce type d'abonnement ? ATTENTION: Cela peut impacter les abonnements en cours.")) return;
      const { error } = await supabaseClient.from('subscription_types').delete().eq('id', id);
      if (error) alert("Erreur: " + error.message);
      else loadAdminData();
    }

    /*
    // Config Save
    document.getElementById('save-config-btn').addEventListener('click', async () => {
      const name = document.getElementById('cfg-club-name').value;
      const bucket = document.getElementById('cfg-storage-bucket').value;
      let logo = document.getElementById('cfg-logo-url').value;
      const logoFile = document.getElementById('cfg-logo-file').files[0];

      show('loading');
      try {
        if (logoFile) {
          const uploadedUrl = await uploadToSupabase(logoFile);
          if (uploadedUrl) logo = uploadedUrl;
        }

        const updateData = { club_name: name, logo_url: logo, storage_bucket: bucket };

        let res;
        if (settings && settings.id) {
          res = await supabaseClient.from('settings').update(updateData).eq('id', settings.id);
        } else {
          // If no settings exist yet, we use upsert with id:1
          res = await supabaseClient.from('settings').upsert({ id: 1, ...updateData });
        }

        if (res.error) throw res.error;

        alert("Réglages enregistrés !");
        document.getElementById('cfg-logo-file').value = '';
        loadAppData();
      } catch (err) {
        alert("Erreur: " + err.message);
      } finally {
        hide('loading');
      }
    });
    */


    // --- CSV IMPORT (générique : nom, email, montant, date) ---
    document.getElementById('csv-import-btn').addEventListener('click', () => {
      document.getElementById('csv-import').click();
    });

    document.getElementById('csv-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      show('loading');
      try {
        // Charger les types d'abonnements pour matcher par prix
        const { data: subTypes, error: stErr } = await supabaseClient.from('subscription_types').select('*');
        if (stErr || !subTypes || subTypes.length === 0) {
          throw new Error("Aucun type d'abonnement configuré. Créez-en d'abord dans l'onglet Abonnements.");
        }

        // Lecture du fichier XLS / XLSX / CSV via SheetJS
        const processRows = async (rows) => {
          if (rows.length === 0) throw new Error("Le fichier est vide.");

          const keys = Object.keys(rows[0]);
          console.log('Colonnes disponibles dans le fichier :', keys);

          // Détection des colonnes — ordre de priorité explicite pour les exports AssoConnect
          const emailKey =
            keys.find(k => /adresse\s*email/i.test(k)) ||
            keys.find(k => /email\s*acheteur/i.test(k)) ||
            keys.find(k => /email|mail/i.test(k));

          const firstNameKey = keys.find(k => /pr[eé]nom\s*participant/i.test(k)) ||
            keys.find(k => /pr[eé]nom/i.test(k));
          const lastNameKey = keys.find(k => /^nom\s*participant$/i.test(k)) ||
            keys.find(k => /\bnom\b/i.test(k) && !/pr[eé]nom/i.test(k));
          const nameKey = keys.find(k => /\bname\b|nom complet/i.test(k));

          const amountKey =
            keys.find(k => /montant\s*d[uû]/i.test(k)) ||
            keys.find(k => /montant|prix|tarif|amount|price|cotisation/i.test(k));

          const endDateKey =
            keys.find(k => /date\s*de\s*fin\s*adh[eé]sion/i.test(k)) ||
            keys.find(k => /date\s*fin/i.test(k));

          const startDateKey =
            keys.find(k => /date\s*de\s*d[eé]but\s*adh[eé]sion/i.test(k)) ||
            keys.find(k => /date\s*de\s*paiement/i.test(k)) ||
            keys.find(k => /date\s*d[eé]but/i.test(k)) ||
            keys.find(k => /date\s*paiement|date\s*cr[eé]ation/i.test(k));

          if (!emailKey) throw new Error("Colonne Email introuvable.");
          if (!amountKey) throw new Error("Colonne Montant introuvable.");
          if (!endDateKey) throw new Error("Colonne 'Date de fin adhésion' introuvable.");

          const parseDate = (raw) => {
            if (!raw && raw !== 0) return null;
            if (typeof raw === 'number') return new Date(Math.round((raw - 25569) * 86400 * 1000));
            const s = raw.toString().trim();
            const dmyMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
            const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
            if (dmyMatch) return new Date(`${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`);
            if (ymdMatch) return new Date(s);
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d;
          };

          let imported = 0, skipped = 0, errors = [];

          for (const row of rows) {
            const email = row[emailKey]?.toString().trim().toLowerCase();
            if (!email) { skipped++; continue; }

            let full_name = 'Membre';
            if (firstNameKey && lastNameKey) full_name = `${row[firstNameKey]} ${row[lastNameKey]}`.trim();
            else if (nameKey) full_name = row[nameKey];
            else if (lastNameKey) full_name = row[lastNameKey];
            if (!full_name) full_name = 'Membre';

            const rawAmount = row[amountKey]?.toString().replace(',', '.').replace(/[^0-9.]/g, '');
            const amount = parseFloat(rawAmount);
            if (isNaN(amount)) { errors.push(`${email} : montant invalide`); continue; }

            const endDate = parseDate(row[endDateKey]);
            if (!endDate) { errors.push(`${email} : date fin invalide`); continue; }
            let startDate = parseDate(row[startDateKey]) || new Date();

            let matchedType = subTypes.find(t => Math.abs(parseFloat(t.price) - amount) < 0.01) ||
              subTypes.reduce((p, c) => Math.abs(parseFloat(c.price) - amount) < Math.abs(parseFloat(p.price) - amount) ? c : p);

            const record = {
              email, full_name,
              subscription_type_id: matchedType.id,
              subscription_start_date: startDate.toISOString().split('T')[0],
              subscription_end_date: endDate.toISOString().split('T')[0]
            };

            // --- Synchronisation immédiate pour les membres déjà inscrits ---
            const { data: profile } = await supabaseClient
              .from('profiles')
              .select('id')
              .eq('email', email)
              .maybeSingle();

            if (profile) {
              // Récupérer le dernier abonnement
              const { data: subs } = await supabaseClient
                .from('subscriptions')
                .select('*')
                .eq('member_id', profile.id)
                .order('end_date', { ascending: false })
                .limit(1);

              const latestSub = subs && subs.length > 0 ? subs[0] : null;

              if (!latestSub || latestSub.type_id !== matchedType.id || latestSub.end_date !== record.subscription_end_date) {
                if (latestSub && latestSub.type_id === matchedType.id) {
                  await supabaseClient.from('subscriptions').update({
                    end_date: record.subscription_end_date,
                    start_date: record.subscription_start_date
                  }).eq('id', latestSub.id);
                } else {
                  await supabaseClient.from('subscriptions').insert({
                    member_id: profile.id,
                    type_id: matchedType.id,
                    start_date: record.subscription_start_date,
                    end_date: record.subscription_end_date
                  });
                }
              }
            }

            const { error: uErr } = await supabaseClient
              .from('imported_members')
              .upsert(record, { onConflict: 'email' });

            if (uErr) errors.push(`${email} : ${uErr.message}`);
            else imported++;
          }

          let msg = `✅ ${imported} membre(s) synchronisé(s) et mis à jour.`;
          if (skipped > 0) msg += `\n⏭ ${skipped} ligne(s) ignorée(s) (email vide).`;
          if (errors.length > 0) msg += `\n⚠️ Erreurs :\n${errors.slice(0, 5).join('\n')}`;
          alert(msg);
          loadAdminData();
        };

        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const data = new Uint8Array(evt.target.result);

            // --- ÉTAPE 1 : lecture du classeur ---
            let workbook;
            try {
              workbook = XLSX.read(data, { type: 'array', cellDates: false });
            } catch (readErr) {
              alert(`❌ SheetJS ne peut pas lire ce fichier.\nErreur : ${readErr.message}\n\nAssurez-vous que le fichier n'est pas corrompu ou protégé par un mot de passe.`);
              hide('loading'); e.target.value = ''; return;
            }

            const sheetNames = workbook.SheetNames;
            if (!sheetNames || sheetNames.length === 0) {
              alert(`❌ Le classeur ne contient aucun onglet.\nFichier peut-être corrompu.`);
              hide('loading'); e.target.value = ''; return;
            }

            // --- ÉTAPE 2 : chercher l'onglet avec le plus de données ---
            let raw = [];
            let usedSheetName = sheetNames[0];
            const sheetDiag = [];

            for (const name of sheetNames) {
              const s = workbook.Sheets[name];
              // Force-expand the declared range in case !ref is too narrow
              if (s['!ref']) {
                try {
                  const range = XLSX.utils.decode_range(s['!ref']);
                  range.e.r = Math.max(range.e.r, 50000);
                  range.e.c = Math.max(range.e.c, 60);
                  s['!ref'] = XLSX.utils.encode_range(range);
                } catch (_) { }
              }
              const r = XLSX.utils.sheet_to_json(s, { header: 1, defval: '', raw: true });
              sheetDiag.push(`"${name}" : ${r.length} ligne(s)`);
              if (r.length > raw.length) {
                raw = r;
                usedSheetName = name;
              }
            }

            if (!raw || raw.length === 0) {
              alert(`❌ SheetJS n'a trouvé aucune ligne dans aucun onglet.\n\nOnglets analysés :\n${sheetDiag.join('\n')}\n\nEssayez de sauvegarder le fichier en .xlsx depuis Excel et réessayez.`);
              hide('loading'); e.target.value = ''; return;
            }

            // --- ÉTAPE 3 : détection de la ligne d'en-têtes ---
            const headerRowIdx = raw.findIndex(r => r.filter(c => c !== '' && c !== null && c !== undefined).length >= 2);
            if (headerRowIdx === -1) {
              const sample = raw.slice(0, 3).map(r => JSON.stringify(r)).join('\n');
              alert(`❌ Impossible de trouver une ligne d'en-têtes.\n\nOnglet : "${sheetNames[0]}"\nLignes lues : ${raw.length}\nExemple des 3 premières lignes :\n${sample}`);
              hide('loading'); e.target.value = ''; return;
            }

            const headers = raw[headerRowIdx].map(h => h?.toString().trim());

            // --- ÉTAPE 4 : construction des lignes de données ---
            const rows = [];
            for (let i = headerRowIdx + 1; i < raw.length; i++) {
              const r = raw[i];
              if (!r || r.every(c => c === '' || c === null || c === undefined)) continue;
              const obj = {};
              headers.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
              rows.push(obj);
            }

            if (rows.length === 0) {
              const headerPreview = headers.slice(0, 10).join(', ');
              const rowAfterHeader = raw[headerRowIdx + 1];
              const sampleRow = rowAfterHeader ? JSON.stringify(rowAfterHeader).substring(0, 200) : '(aucune ligne après en-têtes)';
              alert(`❌ En-têtes trouvés (ligne ${headerRowIdx + 1}) mais aucune ligne de données après.\n\nEn-têtes (10 premiers) : ${headerPreview}\nLigne suivante brute : ${sampleRow}\nNombre total de lignes brutes : ${raw.length}`);
              hide('loading'); e.target.value = ''; return;
            }

            await processRows(rows);
          } catch (err) {
            alert('Erreur lecture fichier : ' + err.message);
          } finally {
            hide('loading');
            e.target.value = '';
          }
        };
        reader.onerror = () => {
          hide('loading');
          alert('Impossible de lire le fichier.');
          e.target.value = '';
        };
        reader.readAsArrayBuffer(file);
      } catch (outerErr) {
        hide('loading');
        alert('Erreur : ' + outerErr.message);
        e.target.value = '';
      }
    });

// ==========================================
// --- GESTION DES STOCKS & CAISSE LIAISON ---
// ==========================================

let stockLogs = JSON.parse(localStorage.getItem('stock_logs') || '[]');

function initDrinkStocks() {
    if (stockLogs.length === 0) {
        stockLogs.push({
            id: 'init',
            timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
            drink_id: null,
            drink_name: 'Initialisation Système',
            type: 'Initialisation',
            qty: 0,
            source: 'Système',
            detail: 'Initialisation de la gestion du stock'
        });
        localStorage.setItem('stock_logs', JSON.stringify(stockLogs));
    }

    drinks.forEach(d => {
        if (d.stock !== undefined && d.stock !== null) {
            return;
        }
        
        const localStockKey = `stock_drink_${d.id}`;
        let localStock = localStorage.getItem(localStockKey);
        if (localStock === null) {
            localStock = 20;
            localStorage.setItem(localStockKey, localStock);
            logStockMovement(d.id, d.name, 'Entrée Stock Initial', 20, 'Admin (Système)', 'Stock initialisé à 20 unités');
        }
        d.stock = parseInt(localStock);
    });
}

function logStockMovement(drinkId, drinkName, type, qty, source, detail) {
    const newLog = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: new Date().toISOString(),
        drink_id: drinkId,
        drink_name: drinkName,
        type: type,
        qty: qty,
        source: source,
        detail: detail
    };
    stockLogs.unshift(newLog);
    localStorage.setItem('stock_logs', JSON.stringify(stockLogs));
}

async function updateDrinkStock(drinkId, newQty, type, changeQty, source, detail) {
    const drink = drinks.find(d => d.id === drinkId);
    if (!drink) return false;

    let dbSuccess = false;
    try {
        const { error } = await supabaseClient
            .from('drinks')
            .update({ stock: newQty })
            .eq('id', drinkId);
        if (!error) {
            dbSuccess = true;
        }
    } catch (e) {
        // En cas d'erreur de colonne inexistante
    }

    localStorage.setItem(`stock_drink_${drinkId}`, newQty);
    drink.stock = newQty;

    logStockMovement(drinkId, drink.name, type, changeQty, source, detail);
    return true;
}

function renderStockDashboard() {
    const stockCardsGrid = document.getElementById('stock-cards-grid');
    if (!stockCardsGrid) return;
    
    let totalDrinks = drinks.length;
    let outOfStockCount = drinks.filter(d => (d.stock || 0) === 0).length;
    let lowStockCount = drinks.filter(d => (d.stock || 0) > 0 && (d.stock || 0) < 5).length;
    let totalStockVolume = drinks.reduce((acc, d) => acc + (d.stock || 0), 0);

    stockCardsGrid.innerHTML = `
        <div class="card" style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); padding: 1rem; border-radius: 12px; display: flex; align-items: center; gap: 1rem;">
            <div style="background: rgba(24, 119, 242, 0.1); color: var(--accent-blue); padding: 0.8rem; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <i data-lucide="glass-water" style="width: 24px; height: 24px;"></i>
            </div>
            <div>
                <span class="text-muted" style="font-size: 0.8rem; display: block;">Références boissons</span>
                <span style="font-size: 1.5rem; font-weight: 700; color: var(--text-main);">${totalDrinks}</span>
            </div>
        </div>
        <div class="card" style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); padding: 1rem; border-radius: 12px; display: flex; align-items: center; gap: 1rem;">
            <div style="background: rgba(37, 211, 102, 0.1); color: var(--accent-green); padding: 0.8rem; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <i data-lucide="boxes" style="width: 24px; height: 24px;"></i>
            </div>
            <div>
                <span class="text-muted" style="font-size: 0.8rem; display: block;">Volume total en stock</span>
                <span style="font-size: 1.5rem; font-weight: 700; color: var(--accent-green);">${totalStockVolume} pcs</span>
            </div>
        </div>
        <div class="card" style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); padding: 1rem; border-radius: 12px; display: flex; align-items: center; gap: 1rem;">
            <div style="background: rgba(255, 193, 7, 0.1); color: var(--accent-gold); padding: 0.8rem; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <i data-lucide="alert-triangle" style="width: 24px; height: 24px;"></i>
            </div>
            <div>
                <span class="text-muted" style="font-size: 0.8rem; display: block;">Stocks faibles (&lt; 5)</span>
                <span style="font-size: 1.5rem; font-weight: 700; color: var(--accent-gold);">${lowStockCount}</span>
            </div>
        </div>
        <div class="card" style="background: rgba(220, 53, 69, 0.1); color: #ff4d4d; padding: 0.8rem; border-radius: 10px; display: flex; align-items: center; gap: 1rem;">
            <div style="background: rgba(220, 53, 69, 0.1); color: #ff4d4d; padding: 0.8rem; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <i data-lucide="x-circle" style="width: 24px; height: 24px;"></i>
            </div>
            <div>
                <span class="text-muted" style="font-size: 0.8rem; display: block;">Ruptures de stock</span>
                <span style="font-size: 1.5rem; font-weight: 700; color: #ff4d4d;">${outOfStockCount}</span>
            </div>
        </div>
    `;

    const adminStockList = document.getElementById('admin-stock-list');
    if (adminStockList) {
        adminStockList.innerHTML = '';
        drinks.forEach(d => {
            const stock = d.stock || 0;
            let statusBadge = '';
            let progressColor = 'var(--accent-green)';
            
            if (stock === 0) {
                statusBadge = '<span class="badge" style="background: rgba(220, 53, 69, 0.2); color: #ff4d4d; border: 1px solid rgba(220, 53, 69, 0.4); font-size: 0.75rem;">Rupture !</span>';
                progressColor = '#ff4d4d';
            } else if (stock < 5) {
                statusBadge = '<span class="badge" style="background: rgba(255, 193, 7, 0.2); color: var(--accent-gold); border: 1px solid rgba(255, 193, 7, 0.4); font-size: 0.75rem;">Faible</span>';
                progressColor = 'var(--accent-gold)';
            } else {
                statusBadge = '<span class="badge" style="background: rgba(40, 167, 69, 0.2); color: var(--accent-green); border: 1px solid rgba(40, 167, 69, 0.4); font-size: 0.75rem;">Correct</span>';
            }

            const percent = Math.min(100, (stock / 50) * 100);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        ${d.image_url ? `<img src="${d.image_url}" style="width:28px;height:28px;object-fit:cover;border-radius:4px;">` : `<i data-lucide="${d.icon || 'glass-water'}"></i>`}
                        <span style="font-weight: 500;">${d.name}</span>
                    </div>
                </td>
                <td>${d.price}€</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 4px; width: 150px;">
                        <span style="font-weight: 700; font-size: 1rem;">${stock} pcs</span>
                        <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 3px; overflow: hidden;">
                            <div style="width: ${percent}%; height: 100%; background: ${progressColor}; border-radius: 3px; transition: width 0.3s;"></div>
                        </div>
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">
                    <button class="btn btn-outline" onclick="openRefillModal(${d.id}, '${d.name.replace(/'/g, "\\'")}')" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 0.75rem; border-color: var(--accent-green); color: var(--accent-green);">
                        <i data-lucide="package-plus" style="width:14px; height:14px;"></i> Approvisionner
                    </button>
                </td>
            `;
            adminStockList.appendChild(row);
        });
    }

    const stockLogsList = document.getElementById('stock-logs-list');
    if (stockLogsList) {
        stockLogsList.innerHTML = stockLogs.map(l => {
            let movementLabel = '';
            if (l.type.startsWith('Entrée')) {
                movementLabel = `<span style="color: var(--accent-green); font-weight: 600;">+${l.qty} (Entrée)</span>`;
            } else if (l.type.startsWith('Retrait')) {
                movementLabel = `<span style="color: #ff4d4d; font-weight: 600;">-${l.qty} (Sortie)</span>`;
            } else {
                movementLabel = `<span style="color: var(--accent-gold); font-weight: 600;">${l.qty > 0 ? '+' : ''}${l.qty} (Ajustement)</span>`;
            }

            let sourceBadge = '';
            if (l.source.includes('Caisse')) {
                sourceBadge = `<span class="badge" style="background: rgba(255, 193, 7, 0.15); color: var(--accent-gold); border: 1px solid rgba(255, 193, 7, 0.3); font-size: 0.7rem;">${l.source}</span>`;
            } else if (l.source.includes('Club')) {
                sourceBadge = `<span class="badge" style="background: rgba(24, 119, 242, 0.15); color: var(--accent-blue); border: 1px solid rgba(24, 119, 242, 0.3); font-size: 0.7rem;">${l.source}</span>`;
            } else {
                sourceBadge = `<span class="badge" style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid var(--border); font-size: 0.7rem;">${l.source}</span>`;
            }

            return `
                <tr>
                    <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(l.timestamp).toLocaleString()}</td>
                    <td style="font-weight: 500;">${l.drink_name || 'N/A'}</td>
                    <td>${movementLabel}</td>
                    <td>${Math.abs(l.qty)} pcs</td>
                    <td>${sourceBadge}</td>
                    <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.detail || '-'}</td>
                </tr>
            `;
        }).join('');
    }
}

window.openRefillModal = function(drinkId, drinkName) {
    document.getElementById('refill-drink-id').value = drinkId;
    document.getElementById('refill-drink-name').value = drinkName;
    document.getElementById('refill-qty-input').value = 24;
    document.getElementById('refill-stock-modal').classList.remove('hidden');
};

document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'btn-simulate-caisse') {
        const select = document.getElementById('caisse-drink-select');
        if (select) {
            select.innerHTML = drinks.map(d => 
                `<option value="${d.id}">${d.name} (Stock actuel: ${d.stock || 0})</option>`
            ).join('');
        }
        document.getElementById('caisse-qty-input').value = 1;
        document.getElementById('caisse-simulation-modal').classList.remove('hidden');
    }
    
    if (e.target && e.target.id === 'btn-submit-refill') {
        const id = parseInt(document.getElementById('refill-drink-id').value);
        const qty = parseInt(document.getElementById('refill-qty-input').value);
        
        if (isNaN(qty) || qty <= 0) {
            alert("Veuillez saisir une quantité supérieure à 0.");
            return;
        }

        const drink = drinks.find(d => d.id === id);
        if (!drink) return;

        const currentStock = drink.stock || 0;
        const newStock = currentStock + qty;

        show('loading');
        updateDrinkStock(id, newStock, 'Entrée (Approvisionnement)', qty, 'Administrateur', `Approvisionnement manuel de +${qty} unités`).then(() => {
            hide('loading');
            document.getElementById('refill-stock-modal').classList.add('hidden');
            loadAdminData();
        });
    }

    if (e.target && e.target.id === 'btn-submit-caisse-sale') {
        const id = parseInt(document.getElementById('caisse-drink-select').value);
        const qty = parseInt(document.getElementById('caisse-qty-input').value);
        const mode = document.getElementById('caisse-mode-select').value;
        
        if (isNaN(qty) || qty <= 0) {
            alert("Veuillez saisir une quantité supérieure à 0.");
            return;
        }

        const drink = drinks.find(d => d.id === id);
        if (!drink) return;

        const currentStock = drink.stock || 0;
        if (qty > currentStock) {
            if (!confirm(`La quantité demandée (${qty}) est supérieure au stock disponible (${currentStock}). Valider quand même et passer en stock négatif ?`)) {
                return;
            }
        }

        const newStock = Math.max(0, currentStock - qty);

        show('loading');
        updateDrinkStock(id, newStock, `Retrait (${mode})`, -qty, 'Caisse Enregistreuse', `Vente/Retrait de ${qty} pcs via caisse bar`).then(() => {
            hide('loading');
            document.getElementById('caisse-simulation-modal').classList.add('hidden');
            loadAdminData();
        });
    }
});
