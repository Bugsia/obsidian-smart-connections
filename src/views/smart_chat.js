export function build_html(obsidian_view, opts = {}) {
  const top_bar_buttons = [
    // { title: 'Open Conversation Note', icon: 'external-link' },
    { title: 'Chat History', icon: 'history' },
    { title: 'Chat Options', icon: 'sliders-horizontal', style: 'display: none;' },
    { title: 'Chat Settings', icon: 'settings' },
    { title: 'New Chat', icon: 'plus' }
  ].map(btn => `
    <button title="${btn.title}" ${btn.style ? `style="${btn.style}"` : ''}>
      ${this.get_icon_html(btn.icon)}
    </button>
  `).join('');

  return `
    <div class="sc-chat-container">
      <div class="sc-top-bar-container">
        <input class="sc-chat-name-input" type="text" value="" placeholder="Add name to save this chat">
        ${top_bar_buttons}
      </div>
      <div id="settings" class="smart-chat-overlay" style="display: none;">
        <div class="smart-chat-overlay-header">
          <button class="smart-chat-overlay-close">
            ${this.get_icon_html('x')}
          </button>
        </div>
        <div class="sc-settings"></div>
      </div>
      <div class="sc-thread">
        <!-- Thread messages will be inserted here -->
      </div>
    </div>
    ${obsidian_view.attribution || ''}
  `;
}

/**
 * Renders the main chat interface
 * @async
 * @param {SmartThreads} threads_collection - Collection of chat threads
 * @param {Object} [opts={}] - Rendering options
 * @param {boolean} [opts.show_settings=false] - Whether to show settings panel
 * @param {boolean} [opts.show_threads=true] - Whether to show threads list
 * @returns {Promise<DocumentFragment>} Rendered chat interface
 */
export async function render(obsidian_view, opts = {}) {
  const html = build_html.call(this, obsidian_view, opts);
  const frag = this.create_doc_fragment(html);
  return await post_process.call(this, obsidian_view, frag, opts);
}

async function save_file_in_attachment_folder(obsidian_view, file, thread) {
  const fs = require('fs');
  const path = require('path');
  const conversationName = thread.key;
  const vaultPath = obsidian_view.app.vault.adapter.getBasePath();
  const folderPath = `smart_chats/smart_attachments/${conversationName}`;
  const fullPath = path.join(vaultPath, folderPath);
  const fileName = file.name;
  const filePath = `${folderPath}/${fileName}`.replace(/[\/\\]/g, '/'); // Replace slashes with forward slashes

  console.log(`Uploading file "${file.name}" to "${fullPath}"`);

  if(!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Folder created at "${fullPath}"`);
  }

  const fileReader = new FileReader();
  fileReader.onload = async () => {
    try {
      const fileData = fileReader.result;

      await obsidian_view.app.vault.createBinary(filePath, new Uint8Array(fileData));
      console.log(`File created at "${filePath}"`);
    }
    catch (error) {
      console.error(`Error creating file at "${filePath}":`, error);
    }
  };

  fileReader.readAsArrayBuffer(file);
}

/**
 * Post-processes the rendered chat interface
 * @async
 * @param {SmartThreads} threads_collection - Collection of chat threads
 * @param {DocumentFragment} frag - Rendered fragment
 * @param {Object} opts - Processing options
 * @returns {Promise<DocumentFragment>} Post-processed fragment
 */
export async function post_process(obsidian_view, frag, opts) {
  const chat_box = frag.querySelector('.sc-thread');
  const settings_button = frag.querySelector('button[title="Chat Settings"]');
  const overlay_container = frag.querySelector(".smart-chat-overlay");
  const settings_container = overlay_container.querySelector(".sc-settings");
  const threads_collection = obsidian_view.env.smart_threads;
  threads_collection.container = frag.querySelector('.sc-chat-container');
  
  // Initialize thread if needed
  let thread;
  if (opts.thread_key){
    thread = threads_collection.get(opts.thread_key);
  }
  if (!thread) thread = threads_collection.get_active_thread();
  if (!thread) {
    thread = await threads_collection.create_or_update({});
  }
  chat_box.setAttribute('data-thread-key', thread.key);
  await thread.render(chat_box, opts);


  const chat_input = frag.querySelector('.sc-chat-form textarea');
  const send_button = frag.querySelector('.send-button');
  if (chat_input) {
    chat_input.addEventListener('keydown', obsidian_view.handle_chat_input_keydown.bind(obsidian_view));

    // On enter press send button
    chat_input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send_button.click();
      }
    });
  }

  setup_upload_button_handler.call(this, obsidian_view, frag, thread);

  // Add close button handler
  const close_button = overlay_container.querySelector(".smart-chat-overlay-close");
  if (close_button) {
    close_button.addEventListener('click', () => {
      overlay_container.style.display = 'none';
    });
  }

  settings_button.addEventListener('click', () => {
    if (overlay_container.style.display === 'none') {
      threads_collection.render_settings(settings_container);
      overlay_container.style.display = 'block';
    } else {
      overlay_container.style.display = 'none';
    }
  });
  
  // New chat button
  const new_chat_button = frag.querySelector('button[title="New Chat"]');
  new_chat_button.addEventListener('click', async () => {
    threads_collection.container.innerHTML = '';
    opts.thread_key = null; // clear thread key saved to `this.render_opts{}`
    // threads_collection.render();
    obsidian_view.render_view();
  });

  // open chat history button
  const chat_history_button = frag.querySelector('button[title="Chat History"]');
  chat_history_button.addEventListener('click', () => {
    obsidian_view.open_chat_history();
  });
  
  // Setup chat name input handler
  setup_chat_name_input_handler.call(this, obsidian_view, frag, thread);

  return frag;
}

function setup_upload_button_handler(obsidian_view, frag, thread) {
  const chat_input = frag.querySelector('.sc-chat-form textarea');

  // Add upload button handler
  const upload_button = frag.querySelector('.upload-button');
  if(upload_button) {
    upload_button.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.click();
      input.addEventListener('change', async (e) => {
        for (let i = 0; i < e.target.files.length; i++) {
          const file = e.target.files[i];
          if (file) {
            await save_file_in_attachment_folder(obsidian_view, file, thread);
            const file_path = `smart_chats/smart_attachments/${thread.key}/${file.name}`;
            obsidian_view.insert_selection(`[[${file_path}]]`);
          }
        }
      });
    });
  }

  // Add handle for pasting images
  chat_input.addEventListener('paste', async (event) => {
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          await save_file_in_attachment_folder(obsidian_view, file, thread);
          const file_path = `smart_chats/smart_attachments/${thread.key}/${file.name}`;
          obsidian_view.insert_selection(`[[${file_path}]]`);
        }
      }
    }
  });
}

function rename_attachments_folder(obsidian_view, oldName, newName) {
  const vault = obsidian_view.app.vault;

  const fs = require('fs');
  const path = require('path');

  const vaultPath = obsidian_view.app.vault.adapter.getBasePath();
  const oldFullPath = path.join(vaultPath, `smart_chats/smart_attachments/${oldName}`);
  const newFullPath = path.join(vaultPath, `smart_chats/smart_attachments/${newName}`);

  if(!fs.existsSync(oldFullPath)) {
    console.error(`Folder does not exist: ${oldFullPath}`);
  }

  try {
    fs.renameSync(oldFullPath, newFullPath);
  }
  catch (error) {
    console.error(`Error renaming folder "${oldFullPath}":`, error);
  }
}

/**
 * Sets up the chat name input change handler
 * @private
 */
function setup_chat_name_input_handler(obsidian_view, frag, thread) {
  const name_input = frag.querySelector('.sc-chat-name-input');
  if (!name_input) return;

  if(!thread.key.startsWith('Untitled')){
    name_input.value = thread.key;
  }

  // Handle renaming on blur
  name_input.addEventListener('blur', async () => {
    const new_name = name_input.value.trim();
    if (new_name && new_name !== thread.key) {
      try {
        const oldName =thread.key;
        await thread.rename(new_name);
        console.log(`Thread renamed to "${new_name}"`);
        rename_attachments_folder(obsidian_view, oldName, new_name);
        console.log(`Attachments folder renamed from "${oldName}" to "${new_name}"`);
        obsidian_view.open_thread(new_name); // Hack, beacuse after renamin upload button event doesnt trigger till chat reloading
      } catch (error) {
        console.error("Error renaming thread:", error);
        // revert the name in the input field
        name_input.value = thread.key;
      }
    }
  });

  // handle renaming on Enter key
  name_input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      name_input.blur(); // Trigger the blur event
    }
  });
}