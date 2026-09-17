// ============================================================================
// Formulario de creación/edición de recursos (admin/recurso-form.html).
// Modo edición si existe ?id= en la URL; si no, modo creación.
// ============================================================================
(function () {
  const supabase = window.MiPortalSupabase;
  const form = document.getElementById('resourceForm');
  if (!form) return;

  const region = document.getElementById('toastRegion');
  const pageTitle = document.getElementById('editorTitle');
  const titleInput = document.getElementById('title');
  const descriptionInput = document.getElementById('description');
  const urlInput = document.getElementById('url');
  const categoryInput = document.getElementById('category');
  const imageUrlInput = document.getElementById('imageUrl');
  const publishedInput = document.getElementById('published');
  const submitButton = document.getElementById('submitButton');
  const cancelButton = document.getElementById('cancelButton');
  const fieldError = document.getElementById('fieldError');
  const loadError = document.getElementById('loadError');
  const formLegend = document.getElementById('formLegend');

  const params = new URLSearchParams(window.location.search);
  const resourceId = params.get('id');

  const toast = (message, type) => window.Admin.showToast(message, type, region);

  // Normaliza y valida una URL exigiendo protocolo https (igual que la parte
  // pública: solo se enlazan recursos con https). Devuelve null si no es válida.
  const validateHttpsUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  };

  const setFieldError = (input, message) => {
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', fieldError.id);
    } else {
      input.removeAttribute('aria-invalid');
    }
    fieldError.textContent = message || '';
    fieldError.hidden = !message;
  };

  const cleanErrors = () => {
    [titleInput, descriptionInput, urlInput, imageUrlInput].forEach((input) => {
      input.removeAttribute('aria-invalid');
    });
    fieldError.textContent = '';
    fieldError.hidden = true;
  };

  const setBusy = (busy) => {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? 'Guardando…' : 'Guardar recurso';
    form.setAttribute('aria-busy', String(busy));
  };

  const showLoadError = (message) => {
    form.hidden = true;
    loadError.hidden = false;
    loadError.textContent = message;
  };

  window.Admin.requireAdmin().then(async (client) => {
    if (!client) return;

    if (!resourceId) {
      pageTitle.textContent = 'Nuevo recurso';
      formLegend.textContent = 'Completá los datos del nuevo recurso. Los campos marcados con * son obligatorios.';
      return;
    }

    pageTitle.textContent = 'Editar recurso';
    formLegend.textContent = 'Modificá los datos del recurso y guardá los cambios. Los campos marcados con * son obligatorios.';

    try {
      const { data, error } = await client
        .from('resources')
        .select('*')
        .eq('id', resourceId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('El recurso no existe o fue eliminado.');

      titleInput.value = data.title || '';
      descriptionInput.value = data.description || '';
      urlInput.value = data.url || '';
      categoryInput.value = data.category || '';
      imageUrlInput.value = data.image_url || '';
      publishedInput.checked = Boolean(data.published);
    } catch (error) {
      showLoadError(`No se pudo cargar el recurso: ${error.message}`);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    cleanErrors();

    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();
    const url = urlInput.value.trim();
    const category = categoryInput.value;
    const imageUrl = imageUrlInput.value.trim();

    if (!title || !description || !url || !category) {
      const emptyField = !title ? titleInput : (!description ? descriptionInput : (!url ? urlInput : categoryInput));
      setFieldError(emptyField, 'Completá todos los campos obligatorios.');
      emptyField.focus();
      return;
    }

    const safeUrl = validateHttpsUrl(url);
    if (!safeUrl) {
      setFieldError(urlInput, 'La URL debe ser una dirección válida que empiece con https://.');
      urlInput.focus();
      return;
    }

    let safeImageUrl = null;
    if (imageUrl) {
      safeImageUrl = validateHttpsUrl(imageUrl);
      if (!safeImageUrl) {
        setFieldError(imageUrlInput, 'La URL de imagen debe ser válida (https://).');
        imageUrlInput.focus();
        return;
      }
    }

    const payload = {
      title,
      description,
      url: safeUrl,
      category,
      image_url: safeImageUrl,
      published: publishedInput.checked
    };

    setBusy(true);

    try {
      if (resourceId) {
        const { error } = await window.Admin.supabase
          .from('resources')
          .update(payload)
          .eq('id', resourceId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await window.Admin.supabase.from('resources').insert(payload);
        if (error) throw new Error(error.message);
      }

      window.location.replace('./?toast=guardado');
    } catch (error) {
      setBusy(false);
      fieldError.hidden = false;
      fieldError.textContent = `No se pudo guardar: ${error.message}`;
      toast(`No se pudo guardar: ${error.message}`, 'error');
    }
  });

  cancelButton.addEventListener('click', () => {
    window.location.replace('./');
  });
})();