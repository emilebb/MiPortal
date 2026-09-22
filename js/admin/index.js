// ============================================================================
// Listado administrativo de recursos (admin/index.html).
// Búsqueda y filtros por estado/categoría (client-side: todo el listado ya
// está en memoria por listAll()).
// ============================================================================
(function () {
  const region = document.getElementById('toastRegion');
  const list = document.getElementById('resourceList');
  const loadingState = document.getElementById('listLoading');
  const emptyState = document.getElementById('listEmpty');
  const emptyText = document.getElementById('listEmptyText');
  const emptyCreate = document.getElementById('listEmptyCreate');
  const emptyClear = document.getElementById('listEmptyClear');
  const errorState = document.getElementById('listError');
  const errorText = document.getElementById('listErrorText');
  const retryButton = document.getElementById('listRetry');
  const deleteDialog = document.getElementById('deleteDialog');
  const deleteDialogTitle = document.getElementById('deleteDialogTitle');
  const deleteDialogDesc = document.getElementById('deleteDialogDesc');
  const confirmDelete = document.getElementById('confirmDelete');
  const filterSearch = document.getElementById('filterSearch');
  const filterStatus = document.getElementById('filterStatus');
  const filterCategory = document.getElementById('filterCategory');
  const resultCount = document.getElementById('resultCount');
  const clearFiltersButton = document.getElementById('clearFilters');

  let pendingDelete = null;
  let allResources = [];
  let busyRow = null;

  const toast = (message, type) => window.Admin.showToast(message, type, region);

  const formatDate = (value) => {
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  };

  const iconMap = { Publicar: '📤', Publicado: '✔', Borrador: '📝', Editar: '✏️', Eliminar: '🗑️' };
  const iconSpan = (name) => {
    const span = document.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    span.textContent = iconMap[name] || '';
    return span;
  };

  const createButton = ({ className, label, onClick }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  };

  const showListStates = (loading, empty, error) => {
    const visibleState = loading ? loadingState : empty ? emptyState : error ? errorState : list;
    [loadingState, emptyState, errorState, list].forEach((state) => {
      const visible = state === visibleState;
      state.hidden = !visible;
      state.setAttribute('aria-hidden', String(!visible));
    });
  };

  const renderRows = (resources) => {
    list.replaceChildren();

    const fragment = document.createDocumentFragment();

    resources.forEach((resource) => {
      const row = document.createElement('article');
      row.className = 'resource-row';
      row.dataset.resourceId = resource.id;

      const info = document.createElement('div');
      info.className = 'resource-info';

      const title = document.createElement('h3');
      title.textContent = resource.title;

      const meta = document.createElement('p');
      meta.className = 'resource-meta';
      const updated = formatDate(resource.updated_at || resource.created_at);
      meta.textContent = `${resource.category}${updated ? ` · Actualizado: ${updated}` : ''}`;

      info.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'resource-actions';

      const badge = document.createElement('span');
      badge.className = resource.published ? 'badge badge-publicado' : 'badge badge-borrador';
      badge.textContent = resource.published ? 'Publicado' : 'Borrador';

      const toggleButton = createButton({
        className: 'btn btn-secondary',
        label: resource.published ? 'Despublicar' : 'Publicar',
        onClick: () => togglePublished(resource, toggleButton)
      });

      const editLink = document.createElement('a');
      editLink.className = 'btn btn-secondary';
      editLink.href = `recurso-form.html?id=${encodeURIComponent(resource.id)}`;
      editLink.textContent = 'Editar';

      const deleteButton = createButton({
        className: 'btn btn-danger',
        label: 'Eliminar',
        onClick: () => confirmDeleteResource(resource)
      });

      actions.append(badge, toggleButton, editLink, deleteButton);
      row.append(info, actions);
      fragment.appendChild(row);
    });

    list.appendChild(fragment);

    const savedToast = new URLSearchParams(window.location.search).get('toast');
    if (savedToast === 'guardado') toast('Recurso guardado correctamente.', 'success');
    if (savedToast === 'eliminado') toast('Recurso eliminado.', 'success');
  };

  const setRowBusy = (row, busy) => {
    row.querySelectorAll('button').forEach((button) => {
      button.disabled = busy;
    });
    row.classList.toggle('is-busy', busy);
  };

  const togglePublished = async (resource, button) => {
    const row = list.querySelector(`[data-resource-id="${resource.id}"]`);
    if (!row || row.classList.contains('is-busy')) return;

    const target = !resource.published;
    setRowBusy(row, true);
    button.textContent = 'Guardando…';

    try {
      await window.Admin.ResourceAPI.setPublished(resource.id, target);
      toast(target ? 'Recurso publicado.' : 'Recurso despublicado.', 'success');
      if (target) window.Admin.notifyPublished(resource.id);
      await loadList();
    } catch (error) {
      toast(`No se pudo actualizar: ${error.message}`, 'error');
      button.textContent = resource.published ? 'Despublicar' : 'Publicar';
      setRowBusy(row, false);
    }
  };

  const confirmDeleteResource = (resource) => {
    pendingDelete = resource;
    deleteDialogTitle.textContent = 'Eliminar recurso';
    deleteDialogDesc.textContent = `¿Seguro que querés eliminar "${resource.title}"? Esta acción no se puede deshacer.`;
    confirmDelete.textContent = 'Eliminar';
    confirmDelete.disabled = false;
    deleteDialog.showModal();
  };

  deleteDialog.addEventListener('close', async () => {
    if (deleteDialog.returnValue !== 'confirm' || !pendingDelete) {
      pendingDelete = null;
      return;
    }

    const row = list.querySelector(`[data-resource-id="${pendingDelete.id}"]`);
    if (row) setRowBusy(row, true);
    confirmDelete.disabled = true;
    confirmDelete.textContent = 'Eliminando…';

    try {
      await window.Admin.ResourceAPI.remove(pendingDelete.id);
      toast('Recurso eliminado.', 'success');
      await loadList();
    } catch (error) {
      toast(`No se pudo eliminar: ${error.message}`, 'error');
      confirmDelete.disabled = false;
      confirmDelete.textContent = 'Eliminar';
      if (row) setRowBusy(row, false);
    } finally {
      pendingDelete = null;
    }
  });

  const applyFilters = () => {
    const query = filterSearch.value.trim().toLowerCase();
    const status = filterStatus.value;
    const category = filterCategory.value;

    return allResources.filter((resource) => {
      if (status !== 'all' && String(resource.published) !== status) return false;
      if (category !== 'all' && resource.category !== category) return false;
      if (
        query &&
        ![resource.title, resource.description, resource.url, resource.category]
          .some((field) => String(field || '').toLowerCase().includes(query))
      ) {
        return false;
      }
      return true;
    });
  };

  const resetFilters = () => {
    filterSearch.value = '';
    filterStatus.value = 'all';
    filterCategory.value = 'all';
    renderList();
  };

  const renderList = () => {
    const filtered = applyFilters();
    const hasFilters = filterSearch.value.trim() !== '' || filterStatus.value !== 'all' || filterCategory.value !== 'all';

    if (allResources.length === 0) {
      emptyText.textContent = 'Todavía no hay recursos cargados. Creá el primero con “+ Nuevo recurso”.';
      emptyCreate.hidden = false;
      emptyClear.hidden = true;
      showListStates(false, true, false);
      list.replaceChildren();
      resultCount.textContent = '0 recursos';
      return;
    }

    if (filtered.length === 0) {
      emptyText.textContent = `No hay recursos que coincidan ${hasFilters ? 'con el filtro' : ''}.`;
      emptyCreate.hidden = true;
      emptyClear.hidden = false;
      showListStates(false, true, false);
      list.replaceChildren();
      resultCount.textContent = '0 recursos';
      return;
    }

    showListStates(false, false, false);
    renderRows(filtered);
    resultCount.textContent = `${filtered.length} de ${allResources.length} recursos`;
  };

  const loadList = async () => {
    showListStates(true, false, false);
    list.replaceChildren();

    try {
      allResources = await window.Admin.ResourceAPI.listAll();
      renderList();
    } catch (error) {
      errorText.textContent = `No se pudieron cargar los recursos: ${error.message}.`;
      showListStates(false, false, true);
    }
  };

  filterSearch.addEventListener('input', renderList);
  filterStatus.addEventListener('change', renderList);
  filterCategory.addEventListener('change', renderList);
  clearFiltersButton.addEventListener('click', resetFilters);
  emptyClear.addEventListener('click', resetFilters);
  retryButton.addEventListener('click', loadList);

  document.getElementById('filterForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
  });

  window.Admin.requireAdmin().then((client) => {
    if (!client) return;
    loadList();
  });
})();