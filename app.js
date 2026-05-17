// Portail Unifié - Billard & Équitation
console.log("Portail Unifié : Démarrage du script...");

let supabaseClient = null;
let currentUser = null;
let drinks = [];
let settings = {};
let isLogin = true;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM chargé, initialisation...");
    try {
        if (typeof supabase === 'undefined') {
            throw new Error("Le SDK Supabase n'est pas chargé. Vérifiez votre connexion internet.");
        }

        const SUPABASE_URL = "https://iwtuwtvgrocmxfkmidlk.supabase.co";
        const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHV3dHZncm9jbXhma21pZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNTM5NzUsImV4cCI6MjA5MzkyOTk3NX0.ISCfQxrD4dAnygL-teYon-KoJWrzDuTEHFZpe9tslmY";
        
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Client Supabase initialisé.");

        await initAuth();
        initNavigation();
        
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
            if (isLogin) {
                toggleText.textContent = "Pas encore de compte ?";
                toggleBtn.textContent = "S'inscrire";
                submitBtn.innerHTML = `Se Connecter <i data-lucide="arrow-right"></i>`;
            } else {
                toggleText.textContent = "Déjà un compte ?";
                toggleBtn.textContent = "Se connecter";
                submitBtn.innerHTML = `Créer un compte <i data-lucide="user-plus"></i>`;
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        toggleLoading(true);
        if (isLogin) {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) alert("Erreur : " + error.message);
        } else {
            const { error } = await supabaseClient.auth.signUp({ email, password });
            if (error) alert("Erreur d'inscription : " + error.message);
            else alert("Inscription réussie ! Vous pouvez maintenant vous connecter.");
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
    showView('login-view');
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

        // 4. Rendu de l'interface
        renderManagementUI();
        
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
    document.getElementById('mem-balance').textContent = `${currentUser.balance.toFixed(2)}€`;
    
    const subs = currentUser.profile?.subscriptions || [];
    const activeSub = subs.sort((a, b) => new Date(b.end_date) - new Date(a.end_date))[0];
    
    const subTypeEl = document.getElementById('mem-sub-type');
    const subBadgeEl = document.getElementById('mem-sub-badge');

    if (activeSub) {
        subTypeEl.textContent = activeSub.subscription_types?.name || 'Standard';
        const isExpired = new Date(activeSub.end_date) < new Date();
        subBadgeEl.textContent = isExpired ? 'Expiré' : 'Actif';
        subBadgeEl.className = isExpired ? 'value danger' : 'value success';
    } else {
        subTypeEl.textContent = 'Aucun';
        subBadgeEl.textContent = 'Inactif';
        subBadgeEl.className = 'value danger';
    }

    // Drinks List
    const drinkList = document.getElementById('drinks-list');
    drinkList.innerHTML = drinks.map(d => {
        const visual = d.image_url 
            ? `<img src="${d.image_url}" alt="${d.name}" class="drink-image">`
            : `<i data-lucide="${d.icon || 'glass-water'}"></i>`;
            
        return `
        <div class="drink-item" onclick="logConsumption(${d.id}, '${d.name}', ${d.price})">
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
    if (!confirm(`Confirmer : ${name} (${price}€) ?`)) return;

    toggleLoading(true);
    const { error } = await supabaseClient.from('consumptions').insert({
        member_id: currentUser.id,
        drink_id: id,
        price_at_time: price
    });
    toggleLoading(false);

    if (error) alert(error.message);
    else loadAppData();
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

    async function loadAdminData() {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Unified Members Fetch
      const { data: mems } = await supabaseClient.from('profiles').select('*, subscriptions(*, subscription_types(*)), consumptions(*)').order('full_name');
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
        row.innerHTML = `
          <td>
            ${m.full_name}
            ${m.role === 'admin' ? '<br><span class="badge badge-active" style="font-size:0.6rem; padding: 0.1rem 0.3rem;">ADMIN</span>' : ''}
          </td>
          <td style="font-size: 0.85rem;">${m.email || '<span class="text-muted">(non renseigné)</span>'}</td>
          <td><span class="badge badge-active" style="font-size: 0.7rem;">Inscrit</span></td>
          <td>${lastSub ? lastSub.subscription_types.name : '<span class="text-muted">Aucun</span>'}</td>
          <td class="${isExpired ? 'text-danger font-bold' : (isJ4 ? 'text-warning font-bold' : 'text-success font-bold')}">${lastSub ? new Date(lastSub.end_date).toLocaleDateString() : '-'}</td>
          <td class="${balance > 0 ? 'text-danger font-bold' : ''}">${balance.toFixed(2)}€</td>
          <td>
            <div style="display: flex; gap: 0.5rem;">
              ${balance > 0 ? `<button class="btn btn-outline" title="Encaisser" onclick="clearMemberBalance('${m.id}')"><i data-lucide="check-circle"></i></button>` : ''}
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
        row.innerHTML = `
          <td>${p.full_name}</td>
          <td style="font-size: 0.85rem;">${p.email}</td>
          <td><span class="badge badge-expired" style="font-size: 0.7rem;">En attente</span></td>
          <td>${p.subscription_types?.name || 'Inconnu'}</td>
          <td class="${isExpired ? 'text-danger font-bold' : (isJ4 ? 'text-warning font-bold' : 'text-success font-bold')}">
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

    // Modal Nouveau Membre
    document.getElementById('add-member-btn').addEventListener('click', async () => {
      const { data: types } = await supabaseClient.from('subscription_types').select('*');
      const select = document.getElementById('manual-mem-type');
      select.innerHTML = types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

      document.getElementById('manual-mem-name').value = '';
      document.getElementById('manual-mem-email').value = '';

      // Set default end date to +1 year
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      document.getElementById('manual-mem-end-date').value = nextYear.toISOString().split('T')[0];

      show('member-modal');
    });

    document.getElementById('save-manual-member-btn').addEventListener('click', async () => {
      const name = document.getElementById('manual-mem-name').value;
      const email = document.getElementById('manual-mem-email').value.trim().toLowerCase();
      const typeId = document.getElementById('manual-mem-type').value;
      const endDate = document.getElementById('manual-mem-end-date').value;

      if (!name || !email || !endDate) return alert("Tous les champs sont requis.");

      show('loading');

      // Enregistrer dans imported_members (staging) pour faire le lien avec le futur compte
      const record = {
        full_name: name,
        email: email,
        subscription_type_id: typeId,
        subscription_end_date: endDate,
        subscription_start_date: new Date().toISOString().split('T')[0]
      };

      const { error } = await supabaseClient.from('imported_members').upsert(record, { onConflict: 'email' });

      if (!error) {
        // --- Synchronisation immédiate pour les membres déjà inscrits ---
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (profile) {
          const { data: subs } = await supabaseClient
            .from('subscriptions')
            .select('*')
            .eq('member_id', profile.id)
            .order('end_date', { ascending: false })
            .limit(1);

          const latestSub = subs && subs.length > 0 ? subs[0] : null;

          if (!latestSub || latestSub.type_id !== typeId || latestSub.end_date !== endDate) {
            if (latestSub && latestSub.type_id === typeId) {
              await supabaseClient.from('subscriptions').update({ end_date: endDate }).eq('id', latestSub.id);
            } else {
              await supabaseClient.from('subscriptions').insert({
                member_id: profile.id,
                type_id: typeId,
                start_date: record.subscription_start_date,
                end_date: endDate
              });
            }
          }
        }
      }

      hide('loading');
      if (error) alert("Erreur: " + error.message);
      else {
        alert("Membre pré-enregistré ! Il pourra récupérer ses droits dès qu'il créera son compte avec cet email.");
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
        console.error("Erreur uploadToSupabase:", err);
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

    document.getElementById('save-drink-btn').addEventListener('click', async () => {
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
      if (res.error) alert("Erreur: " + res.error.message);
      else {
        closeModal('drink-modal');
        loadAppData();
        loadAdminData();
      }
    });

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
