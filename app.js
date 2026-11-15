import { supabase } from './supabase.js';
import { pingAppwrite } from './appwrite.js';

pingAppwrite();

const state = {
  user: null,
  roomId: null,
  roomCode: null,
  sides: [],
  categories: [],
  entries: [],
  role: 'member',
};

const $ = (id) => document.getElementById(id);

const statusEl = $('status');
const authPanel = $('auth-panel');
const boardPanel = $('board-panel');
const roomActions = $('room-actions');
const signInBtn = $('sign-in');
const joinRoomBtn = $('join-room');
const createRoomBtn = $('create-room');
const roomCodeInput = $('room-code');
const roomNameEl = $('room-name');
const comparisonBody = $('comparison-body');
const sideSelect = $('side-select');
const categorySelect = $('category-select');
const pointsInput = $('points-input');
const descriptionInput = $('description-input');
const submitEntryBtn = $('submit-entry');
const entriesUl = $('entries-ul');
const addSideBtn = $('add-side');
const addCategoryBtn = $('add-category');
const resolveBtn = $('resolve');

const setStatus = (text) => {
  statusEl.textContent = text;
};

const show = (el, visible) => {
  if (visible) {
    el.removeAttribute('hidden');
  } else {
    el.setAttribute('hidden', '');
  }
};

const getRole = async (roomId) => {
  const { data, error } = await supabase
    .from('room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', state.user.id)
    .single();

  if (error) {
    console.error(error);
    return 'member';
  }

  return data.role;
};

const signIn = async () => {
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    setStatus(`Sign-in failed: ${error.message}`);
    return;
  }

  state.user = data.user;
  setStatus(`Signed in as ${state.user.id.slice(0, 8)}…`);
  show(signInBtn, false);
  show(roomActions, true);
};

signInBtn.addEventListener('click', signIn);

const createRoom = async () => {
  const code = `room-${Math.random().toString(36).slice(2, 8)}`;

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({ code, name: code, created_by: state.user.id })
    .select()
    .single();

  if (roomError) {
    setStatus(`Room creation failed: ${roomError.message}`);
    return;
  }

  const { error: memberError } = await supabase
    .from('room_members')
    .insert({
      room_id: room.id,
      user_id: state.user.id,
      role: 'board_master',
    });

  if (memberError) {
    setStatus(`Membership failed: ${memberError.message}`);
    return;
  }

  await loadRoom(room.id, room.code);
};

const joinRoom = async () => {
  const code = roomCodeInput.value.trim();

  if (!code) {
    setStatus('Enter a room code');
    return;
  }

  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code)
    .single();

  if (error) {
    setStatus(`Room not found: ${error.message}`);
    return;
  }

  const { error: joinError } = await supabase
    .from('room_members')
    .insert({
      room_id: room.id,
      user_id: state.user.id,
      role: 'member',
    });

  if (joinError && joinError.code !== '23505') {
    setStatus(`Join failed: ${joinError.message}`);
    return;
  }

  await loadRoom(room.id, room.code);
};

createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', joinRoom);

const loadRoom = async (roomId, roomCode) => {
  state.roomId = roomId;
  state.roomCode = roomCode;
  state.role = await getRole(roomId);

  roomNameEl.textContent = `Room: ${roomCode}`;
  show(roomActions, false);
  show(boardPanel, true);
  setStatus(`Role: ${state.role}`);

  await Promise.all([loadSides(), loadCategories(), loadEntries()]);

  subscribeToEntries();
  render();
};

const loadSides = async () => {
  const { data, error } = await supabase
    .from('sides')
    .select('*')
    .eq('room_id', state.roomId)
    .order('created_at');

  if (error) {
    console.error(error);
    return;
  }

  state.sides = data;
};

const loadCategories = async () => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('room_id', state.roomId)
    .order('created_at');

  if (error) {
    console.error(error);
    return;
  }

  state.categories = data;
};

const loadEntries = async () => {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('room_id', state.roomId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  state.entries = data;
};

const subscribeToEntries = () => {
  supabase
    .channel(`room-${state.roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'entries', filter: `room_id=eq.${state.roomId}` },
      () => {
        loadEntries().then(render);
      },
    )
    .subscribe();
};

const render = () => {
  renderComparison();
  renderSideSelect();
  renderCategorySelect();
  renderEntries();
  renderAdminVisibility();
};

const renderComparison = () => {
  const totals = state.sides.map((side) => {
    const confirmed = state.entries.filter(
      (entry) => entry.side_id === side.id && entry.status === 'confirmed',
    );
    const points = confirmed.reduce((sum, entry) => sum + entry.points, 0);
    return { side, points };
  });

  const maxPoints = Math.max(...totals.map((t) => t.points), 0);

  comparisonBody.innerHTML = totals
    .map(({ side, points }) => {
      const isWinner = points > 0 && points === maxPoints;
      return `
        <tr class="${isWinner ? 'winner' : ''}">
          <td>${side.name}</td>
          <td>${points}</td>
        </tr>
      `;
    })
    .join('');
};

const renderSideSelect = () => {
  sideSelect.innerHTML = state.sides
    .map((side) => `<option value="${side.id}">${side.name}</option>`)
    .join('');
};

const renderCategorySelect = () => {
  categorySelect.innerHTML = `
    <option value="">— Custom points —</option>
    ${state.categories
      .map((cat) => `<option value="${cat.id}">${cat.name} (${cat.points} pts)</option>`)
      .join('')}
  `;
};

const renderEntries = () => {
  entriesUl.innerHTML = state.entries
    .map((entry) => {
      const side = state.sides.find((s) => s.id === entry.side_id);
      const canConfirm = entry.status === 'pending' && entry.submitted_by !== state.user.id;
      const confirmBtn = canConfirm
        ? `<button data-confirm="${entry.id}">Confirm</button>`
        : '';
      return `
        <li class="${entry.status}">
          <span>
            <strong>${side ? side.name : 'Unknown'}</strong>:
            ${entry.description}
            <span class="points">+${entry.points}</span>
            <small>(${entry.status})</small>
          </span>
          ${confirmBtn}
        </li>
      `;
    })
    .join('');

  entriesUl.querySelectorAll('[data-confirm]').forEach((btn) => {
    btn.addEventListener('click', () => confirmEntry(btn.dataset.confirm));
  });
};

const renderAdminVisibility = () => {
  const isAdmin = ['board_master', 'co_master'].includes(state.role);
  show(addSideBtn, isAdmin);
  show(addCategoryBtn, isAdmin);
  show(resolveBtn, isAdmin);
};

const submitEntry = async () => {
  const sideId = sideSelect.value;
  const categoryId = categorySelect.value || null;
  const description = descriptionInput.value.trim();
  const customPoints = parseInt(pointsInput.value, 10);

  if (!sideId || !description) {
    setStatus('Pick a side and enter a description');
    return;
  }

  let points = customPoints;

  if (categoryId) {
    const cat = state.categories.find((c) => c.id === categoryId);
    points = cat ? cat.points : 0;
  }

  if (!points || points < 1) {
    setStatus('Points must be at least 1');
    return;
  }

  const { error } = await supabase.from('entries').insert({
    room_id: state.roomId,
    side_id: sideId,
    category_id: categoryId,
    description,
    points,
    status: 'pending',
    submitted_by: state.user.id,
  });

  if (error) {
    setStatus(`Submit failed: ${error.message}`);
    return;
  }

  descriptionInput.value = '';
  pointsInput.value = '';
  categorySelect.value = '';
  setStatus('Entry submitted — waiting for confirmation');
};

const confirmEntry = async (entryId) => {
  const { error } = await supabase
    .from('entries')
    .update({
      status: 'confirmed',
      confirmed_by: state.user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', entryId);

  if (error) {
    setStatus(`Confirm failed: ${error.message}`);
  }
};

submitEntryBtn.addEventListener('click', submitEntry);

const addSide = async () => {
  const name = prompt('Side name:');
  if (!name) {
    return;
  }

  const { error } = await supabase.from('sides').insert({
    room_id: state.roomId,
    name,
  });

  if (error) {
    setStatus(`Add side failed: ${error.message}`);
    return;
  }

  await loadSides();
  render();
};

const addCategory = async () => {
  const name = prompt('Category name:');
  if (!name) {
    return;
  }

  const points = parseInt(prompt('Points for this category:'), 10);
  if (!points || points < 1) {
    setStatus('Points must be at least 1');
    return;
  }

  const { error } = await supabase.from('categories').insert({
    room_id: state.roomId,
    name,
    points,
  });

  if (error) {
    setStatus(`Add category failed: ${error.message}`);
    return;
  }

  await loadCategories();
  render();
};

const resolve = () => {
  const totals = state.sides.map((side) => {
    const confirmed = state.entries.filter(
      (entry) => entry.side_id === side.id && entry.status === 'confirmed',
    );
    return {
      name: side.name,
      points: confirmed.reduce((sum, entry) => sum + entry.points, 0),
    };
  });

  const max = Math.max(...totals.map((t) => t.points));
  const winners = totals.filter((t) => t.points === max);

  if (winners.length === 0 || max === 0) {
    alert('No confirmed entries yet');
    return;
  }

  if (winners.length > 1) {
    alert(`It’s a tie: ${winners.map((w) => w.name).join(' & ')}`);
    return;
  }

  alert(`Winner: ${winners[0].name} with ${winners[0].points} points`);
};

addSideBtn.addEventListener('click', addSide);
addCategoryBtn.addEventListener('click', addCategory);
resolveBtn.addEventListener('click', resolve);
