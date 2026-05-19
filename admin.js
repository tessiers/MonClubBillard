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

        const avatarHtml = m.avatar_url ? 
          `<img src="${m.avatar_url}" style="width:32px; height:32px; border-radius:50%; object-fit:cover; border: 1px solid rgba(255,255,255,0.2); vertical-align: middle; margin-right: 8px;">` : 
          `<div style="width:32px; height:32px; border-radius:50%; background:rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); display:inline-flex; align-items:center; justify-content:center; font-weight:bold; color:#22c55e; vertical-align: middle; margin-right: 8px;">${m.full_name.charAt(0).toUpperCase()}</div>`;

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>
            <div style="display:flex; align-items:center;">
              ${avatarHtml}
              <div>
                ${m.full_name}
                ${m.role === 'admin' ? '<br><span class="badge badge-active" style="font-size:0.6rem; padding: 0.1rem 0.3rem;">ADMIN</span>' : ''}
              </div>
            </div>
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
      let avatarUrl = document.getElementById('manual-mem-avatar-url') ? document.getElementById('manual-mem-avatar-url').value : '';
      const avatarFile = document.getElementById('manual-mem-avatar-file') ? document.getElementById('manual-mem-avatar-file').files[0] : null;

      if (!name || !email || !endDate) return alert("Tous les champs (Nom, Email, Date) sont requis.");

      show('loading');

      if (avatarFile) {
        const uploadedUrl = await uploadToSupabase(avatarFile);
        if (uploadedUrl) avatarUrl = uploadedUrl;
      }

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
          // Mise à jour de la photo de profil s'il y a un changement
          if (avatarUrl || avatarUrl === '') {
             try {
                 await supabaseClient.from('profiles').update({ avatar_url: avatarUrl }).eq('id', profile.id);
             } catch(err) {
                 console.warn("Erreur MAJ avatar (colonne avatar_url peut-être manquante)", err);
             }
          }

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

