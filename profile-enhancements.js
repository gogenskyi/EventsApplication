window.addEventListener('load',()=>{
  const dialog=document.querySelector('#profile');
  if(!dialog)return;
  const observer=new MutationObserver(()=>{
    const actions=document.querySelector('.profile-actions');
    if(!actions||document.querySelector('#avatarUpload'))return;
    const button=document.createElement('button');button.id='avatarButton';button.textContent='📷 Змінити аватарку';
    const input=document.createElement('input');input.id='avatarUpload';input.className='hidden';input.type='file';input.accept='image/png,image/jpeg,image/webp';
    actions.prepend(input);actions.prepend(button);
    button.onclick=()=>input.click();
    input.onchange=async e=>{
      const file=e.target.files?.[0];if(!file)return;
      const fd=new FormData();fd.append('avatar',file);
      try{const r=await fetch('/api/me/avatar',{method:'POST',credentials:'include',body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||'UPLOAD_FAILED');alert('Аватарку оновлено ✓');dialog.close();if(typeof openProfile==='function')openProfile()}catch{alert('Не вдалося завантажити аватарку')}};
  });
  observer.observe(dialog,{childList:true,subtree:true});
});
