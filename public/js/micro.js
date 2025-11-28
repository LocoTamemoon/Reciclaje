document.addEventListener('DOMContentLoaded',function(){
  document.body.addEventListener('pointerdown',function(e){
    const el = e.target.closest('.btn');
    if(!el || el.disabled) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const d = Math.max(rect.width, rect.height)*1.4;
    const r = document.createElement('span');
    r.className = 'ripple';
    r.style.width = d+'px';
    r.style.height = d+'px';
    r.style.left = x+'px';
    r.style.top = y+'px';
    el.appendChild(r);
    r.addEventListener('animationend',function(){ if(r && r.parentNode) r.parentNode.removeChild(r); });
  },{passive:true});

  document.addEventListener('keydown',function(e){
    if(e.key !== 'Escape') return;
    document.querySelectorAll('.modal:not([hidden])').forEach(function(m){ m.hidden = true; });
  });
});
