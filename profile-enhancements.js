window.addEventListener('load',()=>{
  const dialog=document.querySelector('#profile');
  if(!dialog)return;
  const observer=new MutationObserver(()=>{
    if(!window.state?.user && !window.__profileReady)return;
    if(document.querySelector('#avatarUpload'))return;
    const actions=document.querySelector('.profile-actions');
    if(!actions)return;
    const wrap=document.createElement('div');
    wrap.innerHTML='<input id="avatarUpload" class="hidden" type="file" accept="image/png,image/jpeg,image/webp"><button id="avatarButton">📷 Змінити аватарку</button>';
    actions.prepend(wrap.firstElementChild);actions.prepend(wrap.lastElementChild);
    document.querySelector('#avatarButton').onclick=()=>document.querySelector('#avatarUpload').click();
    document.querySelector('#avatarUpload').onchange=async e=>{
      const file=e.target.files?.[0];if(!file)return;
      const fd=new FormData();fd.append('avatar',file);
      try{const r=await fetch('/api/me/avatar',{method:'POST',credentials:'include',body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||'UPLOAD_FAILED');window.state.user=d.user;alert('Аватарку оновлено ✓');dialog.close();window.openProfile()}catch{alert('Не вдалося завантажити аватарку')}};
  });
  observer.observe(dialog,{childList:true,subtree:true});
});
