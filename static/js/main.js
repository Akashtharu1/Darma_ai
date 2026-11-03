
// main.js — User Dashboard (all features wired)
document.addEventListener('DOMContentLoaded', function () {

  /* ── helpers ── */
  function showToast(msg, type) {
    var e = document.getElementById('_toast'); if (e) e.remove();
    var t = document.createElement('div'); t.id = '_toast';
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:14px 20px;border-radius:10px;font-size:.9rem;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.15);transition:opacity .4s;'
      + (type === 'success' ? 'background:#10b981;color:#fff;' : 'background:#ef4444;color:#fff;');
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(function(){ t.style.opacity='0'; setTimeout(function(){ t.remove(); },400); }, 3000);
  }
  window.showToast = showToast;

  function modal(id){ var m=document.getElementById(id); if(m) m.style.display='flex'; }
  function closeModal(id){ var m=document.getElementById(id); if(m) m.style.display='none'; }
  window.closeModal = closeModal;

  function drawHeatmapOnCanvas(canvasId, imgSrc) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !imgSrc) return;
    var ctx = canvas.getContext('2d');
    var img = new Image();
    img.onload = function() {
      canvas.width = canvas.offsetWidth || 80;
      canvas.height = canvas.offsetHeight || 80;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var cx = canvas.width * 0.5, cy = canvas.height * 0.45, r = Math.min(canvas.width, canvas.height) * 0.38;
      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(255,0,0,0.75)');
      grad.addColorStop(0.3, 'rgba(255,140,0,0.6)');
      grad.addColorStop(0.6, 'rgba(255,255,0,0.35)');
      grad.addColorStop(1, 'rgba(0,0,128,0.05)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    img.src = imgSrc;
  }
  window.drawHeatmapOnCanvas = drawHeatmapOnCanvas;

  function infoModal(title, body) {
    var e = document.getElementById('_imodal'); if (e) e.remove();
    var m = document.createElement('div'); m.id = '_imodal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center;';
    var inner = document.createElement('div');
    inner.style.cssText = 'background:#fff;border-radius:14px;padding:28px;max-width:520px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);';
    inner.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">'
      + '<h3 style="font-size:1.1rem;color:#0f172a">' + title + '</h3>'
      + '<button onclick="document.getElementById(\'_imodal\').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#64748b">&times;</button></div>'
      + body;
    m.appendChild(inner);
    m.addEventListener('click', function(ev){ if(ev.target===m) m.remove(); });
    document.body.appendChild(m);
  }

  /* ── populate user info ── */
  if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
    document.querySelectorAll('.user-name').forEach(function(el){ el.textContent = CURRENT_USER.name; });
    document.querySelectorAll('.user-role').forEach(function(el){ el.textContent = CURRENT_USER.role; });
    document.querySelectorAll('.profile-avatar').forEach(function(el){ el.textContent = CURRENT_USER.name.charAt(0).toUpperCase(); });
    var pN=document.getElementById('profileName'), pE=document.getElementById('profileEmail'),
        pP=document.getElementById('profilePhone'), pR=document.getElementById('profileRole');
    if(pN) pN.value=CURRENT_USER.name;
    if(pE) pE.value=CURRENT_USER.email;
    if(pP) pP.value=CURRENT_USER.phone||'';
    if(pR) pR.value=CURRENT_USER.role;
  }

  /* ── sidebar navigation ── */
  var sidebarLinks = document.querySelectorAll('.sidebar-menu a');
  var views = document.querySelectorAll('.view-content');
  function switchView(id){
    views.forEach(function(v){ v.style.display='none'; });
    var t=document.getElementById(id); if(t) t.style.display='block';
  }
  sidebarLinks.forEach(function(link){
    link.addEventListener('click', function(e){
      e.preventDefault();
      sidebarLinks.forEach(function(l){ l.classList.remove('active'); });
      link.classList.add('active');
      var tid=link.getAttribute('data-target'); if(tid) switchView(tid);
    });
  });

  /* ── settings tabs handled below after DOM is ready ── */

  /* ── logout ── */
  var cLB=document.getElementById('confirmLogoutBtn');
  if(cLB) cLB.addEventListener('click', function(){ window.location.href='/logout'; });
  var xLB=document.getElementById('cancelLogoutBtn');
  if(xLB) xLB.addEventListener('click', function(){
    var l=document.querySelector('.sidebar-menu a[data-target="new-diagnosis-content"]');
    if(l) l.click();
  });

  /* ── image upload + Change Image button ── */
  var dropZone=document.getElementById('dropZone');
  var fileInput=document.getElementById('fileInput');
  var previewContainer=document.getElementById('imagePreviewContainer');
  var previewImage=document.getElementById('previewImage');
  var currentFile=null;

  function handleFile(file){
    if(!file||!file.type.startsWith('image/')) return;
    currentFile=file;
    var r=new FileReader();
    r.onload=function(ev){
      previewImage.src=ev.target.result;
      previewContainer.style.display='flex';
      document.querySelectorAll('.result-section').forEach(function(el){ el.classList.remove('active'); });
    };
    r.readAsDataURL(file);
  }

  if(dropZone){
    dropZone.addEventListener('dragover',function(e){ e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave',function(){ dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop',function(e){
      e.preventDefault(); dropZone.classList.remove('dragover');
      if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    dropZone.addEventListener('click',function(e){
      if(e.target.tagName!=='BUTTON'&&!e.target.closest('button')) fileInput.click();
    });
    fileInput.addEventListener('change',function(e){ if(e.target.files.length) handleFile(e.target.files[0]); });
  }

  // Change Image button inside preview
  var changeImgBtn = document.getElementById('changeImageBtn');
  if(changeImgBtn){
    changeImgBtn.addEventListener('click', function(e){
      e.stopPropagation();
      currentFile=null;
      previewContainer.style.display='none';
      previewImage.src='';
      fileInput.value='';
      document.querySelectorAll('.result-section').forEach(function(el){ el.classList.remove('active'); });
      fileInput.click();
    });
  }

  /* ── analyze button ── */
  var analyzeBtn=document.getElementById('analyzeBtn');
  if(analyzeBtn){
    analyzeBtn.addEventListener('click',function(){
      if(!currentFile){ showToast('Please upload an image first.','error'); return; }
      var age=document.getElementById('patAge').value;
      var gender=document.getElementById('patGender').value;
      var symptoms=document.getElementById('patSymptoms').value;
      var patName=document.getElementById('patName')?document.getElementById('patName').value.trim():'';
      if(!age||!symptoms||!patName){ showToast('Fill in Patient Name, Age and Symptoms.','error'); return; }
      var overlay=document.getElementById('loadingOverlay');
      if(overlay) overlay.style.display='flex';
      var fd=new FormData();
      fd.append('image',currentFile); fd.append('age',age);
      fd.append('gender',gender); fd.append('symptoms',symptoms);
      fd.append('patient_name',patName);
      var ep=document.getElementById('existingPatientId');
      if(ep && ep.value) fd.append('existing_patient_id',ep.value);
      fetch('/api/diagnose',{method:'POST',body:fd})
      .then(function(r){ return r.json(); })
      .then(function(data){
        if(overlay) overlay.style.display='none';
        if(!data.success){ showToast(data.message||'Diagnosis failed.','error'); return; }
        var pid=document.getElementById('patIdDisplay');
        if(pid) pid.value=data.patient_id;

        // Show result panel
        var panel=document.getElementById('aiResultsPanel');
        if(panel) panel.style.display='block';

        // ── Patient header ──
        var pidEl=document.getElementById('resPatientId');
        if(pidEl) pidEl.textContent='Patient ID: '+data.patient_id;
        // Separate name / age / gender lines
        var pn=document.getElementById('resPatName'); if(pn) pn.textContent=patName;
        var pa=document.getElementById('resPatAge');  if(pa) pa.textContent=age+' years';
        var pg=document.getElementById('resPatGender'); if(pg) pg.textContent=gender;
        var vcEl=document.getElementById('resVisitCount');
        if(vcEl) vcEl.textContent=data.visit_count||1;
        var fvEl=document.getElementById('resFirstVisit');
        if(fvEl) fvEl.textContent=data.first_visit||data.date;
        var lvEl=document.getElementById('resLastVisit');
        if(lvEl) lvEl.textContent=data.date;
        var prEl=document.getElementById('resPrevReports');
        if(prEl) prEl.textContent=Math.max(0,(data.visit_count||1)-1);

        // ── Returning patient: fetch history and populate comparison ──
        if(data.is_returning && data.patient_id){
          fetch('/api/patient/'+data.patient_id+'/compare')
          .then(function(r){return r.json();})
          .then(function(cmp){
            if(!cmp.success||!cmp.has_previous) return;
            var prev=cmp.previous, curr=cmp.current;
            var sec=document.getElementById('resCmpSection');
            if(sec) sec.style.display='block';

            // Titles
            var e=function(id,v){var el=document.getElementById(id);if(el)el.textContent=v;};
            e('resPrevTitle','Previous Report (Visit '+(prev.visit_number||1)+')');
            e('resCurrTitle','Current Report (Visit '+(curr.visit_number||1)+')');
            e('resPrevDate','Date: '+(prev.date||'—'));
            e('resCurrDate','Date: '+(curr.date||'—'));

            // Prev image
            if(prev.image_path){
              var pi=document.getElementById('resPrevImg');
              if(pi){pi.src='/'+prev.image_path;pi.style.display='block';}
              document.getElementById('resPrevImgNA').style.display='none';
              // heatmap
              drawHeatmapOnCanvas('resPrevHeatmap','/'+prev.image_path);
              // Image comparison section
              var ip=document.getElementById('resImgPrev');
              if(ip){ip.src='/'+prev.image_path;ip.style.display='block';}
              document.getElementById('resImgPrevNA').style.display='none';
              e('resImgPrevLbl','Previous Image (Visit '+(prev.visit_number||1)+')\n'+(prev.date||''));
            }
            if(curr.image_path){
              var ci=document.getElementById('resCurrImg');
              if(ci){ci.src='/'+curr.image_path;ci.style.display='block';}
              document.getElementById('resCurrImgNA').style.display='none';
              drawHeatmapOnCanvas('resCurrHeatmap','/'+curr.image_path);
              var ic=document.getElementById('resImgCurr');
              if(ic){ic.src='/'+curr.image_path;ic.style.display='block';}
              document.getElementById('resImgCurrNA').style.display='none';
              e('resImgCurrLbl','Current Image (Visit '+(curr.visit_number||1)+')\n'+(curr.date||''));
            }

            // Table fields
            var prevSuggs=[]; try{prevSuggs=JSON.parse(prev.suggestions||'[]');}catch(ex){}
            var currSuggs=[]; try{currSuggs=JSON.parse(curr.suggestions||'[]');}catch(ex){}
            var rc=function(d){return d.risk==='High Risk'?'#ef4444':d.risk==='Medium Risk'?'#f59e0b':'#10b981';};
            e('resPrevDisease',prev.disease||'—'); document.getElementById('resPrevDisease').style.color=rc(prev);
            e('resCurrDisease',curr.disease||'—'); document.getElementById('resCurrDisease').style.color=rc(curr);
            e('resPrevRaw',(prev.confidence||0)/100+' ('+prev.confidence+'%)');
            e('resCurrRaw',(curr.confidence||0)/100+' ('+curr.confidence+'%)');
            var calPrevVal = prev.calibrated_confidence!=null ? (prev.calibrated_confidence/100).toFixed(2)+' ('+prev.calibrated_confidence+'%)' : 'N/A';
            var calCurrVal = curr.calibrated_confidence!=null ? (curr.calibrated_confidence/100).toFixed(2)+' ('+curr.calibrated_confidence+'%)' : 'N/A';
            e('resPrevCal', calPrevVal);
            e('resCurrCal', calCurrVal);
            e('resPrevSymptoms',prev.symptoms||'—');
            e('resCurrSymptoms',curr.symptoms||'—');
            e('resPrevRecs',prevSuggs.slice(0,2).join('; ')||'—');
            e('resCurrRecs',currSuggs.slice(0,2).join('; ')||'—');

            // Summary table
            var diseaseChanged=prev.disease!==curr.disease;
            var rawDiff=(curr.confidence||0)-(prev.confidence||0);
            var calDiff=curr.calibrated_confidence!=null&&prev.calibrated_confidence!=null?(curr.calibrated_confidence-prev.calibrated_confidence):null;
            var summBody=document.getElementById('resSummaryBody');
            if(summBody){
              var badge=function(txt,col){return '<span style="background:'+col+';color:#fff;padding:2px 8px;border-radius:20px;font-size:.72rem;font-weight:600;">'+txt+'</span>';};
              var diff=function(v){return v===0?'—':(v>0?'<span style="color:#10b981">&#8593; +'+v+'%</span>':'<span style="color:#ef4444">&#8595; '+v+'%</span>');};
              var fmtConf=function(v){return v!=null?(v/100).toFixed(2):'N/A';};
              var calDiffStr=calDiff!==null?(calDiff>=0?'<span style="color:#10b981">&#8593; +'+(calDiff/100).toFixed(2)+'</span>':'<span style="color:#ef4444">&#8595; '+(calDiff/100).toFixed(2)+'</span>'):'—';
              var rawDiffStr=rawDiff>=0?'<span style="color:#10b981">&#8593; +'+(rawDiff/100).toFixed(2)+'</span>':'<span style="color:#ef4444">&#8595; '+(rawDiff/100).toFixed(2)+'</span>';
              summBody.innerHTML='<tr class="cmp-row"><td>Visit Date</td><td>'+(prev.date||'—')+'</td><td>'+(curr.date||'—')+'</td><td>—</td></tr>'
                +'<tr class="cmp-row"><td>Predicted Condition</td><td style="color:'+rc(prev)+';font-weight:600">'+(prev.disease||'—')+'</td><td style="color:'+rc(curr)+';font-weight:600">'+(curr.disease||'—')+'</td><td>'+(diseaseChanged?badge('Changed','#ef4444'):badge('Same','#10b981'))+'</td></tr>'
                +'<tr class="cmp-row"><td>Raw Confidence</td><td>'+fmtConf(prev.confidence)+'</td><td>'+fmtConf(curr.confidence)+'</td><td>'+rawDiffStr+'</td></tr>'
                +'<tr class="cmp-row"><td>Calibrated Confidence</td><td>'+fmtConf(prev.calibrated_confidence)+'</td><td>'+fmtConf(curr.calibrated_confidence)+'</td><td>'+calDiffStr+'</td></tr>'
                +'<tr class="cmp-row"><td>Symptoms</td><td>'+(prev.symptoms||'—')+'</td><td>'+(curr.symptoms||'—')+'</td><td>'+(prev.symptoms!==curr.symptoms?badge('Updated','#f59e0b'):'—')+'</td></tr>'
                +'<tr class="cmp-row"><td>Recommendations</td><td>'+(prevSuggs[0]||'—')+'</td><td>'+(currSuggs[0]||'—')+'</td><td>'+(diseaseChanged?'<span style="color:#ef4444;font-weight:600">More urgent</span>':'—')+'</td></tr>';
            }

            // AI Analysis of Changes
            var chList=document.getElementById('resAiChanges');
            if(chList){
              var items=[];
              if(diseaseChanged) items.push('The predicted condition has changed from <strong>'+prev.disease+'</strong> to <strong>'+curr.disease+'</strong>.');
              else items.push('The predicted condition remains <strong>'+curr.disease+'</strong>.');
              items.push('Confidence scores show a '+(Math.abs(rawDiff)<=3?'minimal':rawDiff>0?'slight increase.':'slight decrease.'));
              if(prev.symptoms!==curr.symptoms) items.push('Symptoms indicate changes in lesion appearance.');
              if(diseaseChanged&&(curr.risk==='High Risk')) items.push('<span style="color:#ef4444">⚠ Risk level is High — please consult a dermatologist urgently.</span>');
              items.push('Please consult a dermatologist for a professional evaluation.');
              chList.innerHTML=items.map(function(i){return '<li style="display:flex;gap:8px;align-items:flex-start;"><span style="color:#4f46e5;flex-shrink:0">•</span><span>'+i+'</span></li>';}).join('');
            }

            // Visit Timeline
            fetch('/api/patient/'+data.patient_id+'/history')
            .then(function(r){return r.json();})
            .then(function(hist){
              var tl=document.getElementById('resTimeline');
              if(!tl) return;
              tl.innerHTML='';
              var diags=hist.diagnoses||[];
              var colors=['#4f46e5','#6366f1','#10b981','#f59e0b','#ef4444'];
              diags.forEach(function(d,i){
                var vn=d.visit_number||i+1;
                var isCurr=i===diags.length-1;
                var col=colors[i%colors.length];
                tl.innerHTML+='<div style="display:flex;align-items:flex-start;gap:12px;">'
                  +'<div class="tl-dot" style="background:'+(isCurr?col:'#e0e7ff')+';color:'+(isCurr?'#fff':col)+'">'+vn+'</div>'
                  +'<div style="flex:1;">'
                  +'<div style="font-size:.82rem;font-weight:'+(isCurr?'700':'600')+';color:'+(isCurr?col:'#0f172a')+'">Visit '+vn+(isCurr?' (Current)':'')+': '+d.disease+'</div>'
                  +'<div style="font-size:.72rem;color:#94a3b8;">'+d.date+'</div>'
                  +'<div style="font-size:.75rem;color:#64748b;">Confidence: '+(d.confidence||0)+'%</div>'
                  +'</div>'
                  +'<button onclick="viewDiagnosis(\''+d.diag_id+'\')" style="font-size:.72rem;padding:4px 10px;border:1px solid '+(isCurr?col:'#e2e8f0')+';border-radius:6px;background:'+(isCurr?col:'#fff')+';color:'+(isCurr?'#fff':col)+';cursor:pointer;white-space:nowrap;">'+(isCurr?'Current Report':'View Report')+'</button>'
                  +'</div>';
              });

              // Confidence Score Comparison chart
              var confCtx=document.getElementById('resConfChart');
              if(confCtx&&diags.length){
                var labels=diags.map(function(d,i){return 'Visit '+(d.visit_number||i+1);});
                var rawData=diags.map(function(d){return (d.confidence||0)/100;});
                var calData=diags.map(function(d){return d.calibrated_confidence!=null?d.calibrated_confidence/100:null;});
                if(window._resConfChart) window._resConfChart.destroy();
                window._resConfChart=new Chart(confCtx.getContext('2d'),{
                  type:'bar',
                  data:{labels:labels,datasets:[
                    {label:'Raw Confidence',data:rawData,backgroundColor:'#4f46e5',borderRadius:4},
                    {label:'Calibrated',data:calData,backgroundColor:'#a78bfa',borderRadius:4}
                  ]},
                  options:{responsive:true,maintainAspectRatio:false,
                    scales:{y:{min:0,max:1,ticks:{callback:function(v){return (v*100).toFixed(0)+'%';}}}},
                    plugins:{legend:{display:false},datalabels:{display:false}}}
                });
              }
            });
          });
        } else {
          var sec=document.getElementById('resCmpSection');
          if(sec) sec.style.display='none';
        }

        // Disease + confidence
        document.getElementById('predDisease').textContent=data.disease;
        document.getElementById('confidenceText').textContent=data.confidence+'%';
        var ct2=document.getElementById('confidenceText2');
        if(ct2) ct2.textContent=data.confidence+'%';

        // Calibrated confidence display
        var calConfEl=document.getElementById('calibratedConfText');
        var calConfRow=document.getElementById('calibratedConfRow');
        if(calConfEl && calConfRow){
          if(data.calibrated_confidence != null){
            calConfEl.textContent=data.calibrated_confidence+'%';
            calConfRow.style.display='flex';
          } else {
            calConfEl.textContent='N/A';
            calConfRow.style.display='flex';
          }
        }

        // Fetch calibration metrics (ECE, Brier, reliability diagram)
        fetch('/api/calibration/user-status')
        .then(function(r){ return r.json(); })
        .then(function(cal){
          if(!cal || !cal.success || !cal.calibrated) {
            var box=document.getElementById('calMetricsBox');
            if(box) box.style.display='none';
            return;
          }
          var box=document.getElementById('calMetricsBox');
          if(box) box.style.display='block';
          var eR=document.getElementById('calEceRaw');     if(eR) eR.textContent=cal.ece_before.toFixed(4);
          var eA=document.getElementById('calEceAfter');   if(eA) eA.textContent=cal.ece_after.toFixed(4);
          var bR=document.getElementById('calBrierRaw');   if(bR) bR.textContent=cal.brier_before.toFixed(4);
          var bA=document.getElementById('calBrierAfter'); if(bA) bA.textContent=cal.brier_after.toFixed(4);
          var ei=document.getElementById('calEvalInfo');  if(ei) ei.textContent='Evaluated on '+cal.n_samples+' samples (test: '+cal.n_test+')';
          var ti=document.getElementById('calTempInfo');   if(ti) ti.textContent='Temperature: '+cal.temperature;
          var di=document.getElementById('calDateInfo');    if(di) di.textContent='Date: '+cal.eval_date;
          // Reliability diagram
          var ctx=document.getElementById('userReliabilityChart');
          if(ctx && cal.diagram_before && cal.diagram_after){
            var db=cal.diagram_before, da=cal.diagram_after;
            var labels=db.bin_centers.map(function(v){return (v*100).toFixed(0)+'%';});
            if(window._userRelChart) window._userRelChart.destroy();
            window._userRelChart=new Chart(ctx.getContext('2d'),{
              type:'line',
              data:{labels:labels,datasets:[
                {label:'Perfect',data:db.bin_centers,borderColor:'#94a3b8',borderDash:[4,3],borderWidth:1,pointRadius:0,fill:false},
                {label:'Raw',data:db.avg_acc,borderColor:'#ef4444',borderWidth:2,pointRadius:3,fill:false,tension:.2},
                {label:'Calibrated',data:da.avg_acc,borderColor:'#4f46e5',borderWidth:2,pointRadius:3,fill:false,tension:.2}
              ]},
              options:{responsive:true,maintainAspectRatio:false,
                scales:{y:{min:0,max:1,display:true,ticks:{font:{size:8}}},
                        x:{display:true,ticks:{font:{size:7},maxTicksLimit:5}}},
                plugins:{legend:{display:false}}}
            });
          }
        })
        .catch(function(){});

        // Risk tag
        var rEl=document.getElementById('predRisk');
        rEl.textContent=data.risk;
        rEl.style.cssText='font-size:.75rem;padding:3px 10px;border-radius:20px;font-weight:600;'+(data.risk==='High Risk'?'background:#fee2e2;color:#dc2626;':data.risk==='Medium Risk'?'background:#fef3c7;color:#d97706;':'background:#dcfce7;color:#16a34a;');

        // Confidence bar
        var confBar=document.getElementById('confBar');
        if(confBar){ confBar.style.width='0%'; confBar.style.background=data.confidence>=85?'#10b981':data.confidence>=70?'#f59e0b':'#ef4444'; setTimeout(function(){ confBar.style.width=data.confidence+'%'; },50); }

        // Probability bars
        var DISEASES=['Melanoma','Nevus','Basal Cell Carcinoma','Psoriasis','Eczema'];
        var probBars=document.getElementById('probBars');
        if(probBars){
          probBars.innerHTML='';
          var remaining=100-data.confidence;
          var others=DISEASES.filter(function(d){ return d!==data.disease; });
          var probs={}; probs[data.disease]=data.confidence;
          var split=Math.floor(remaining/others.length);
          others.forEach(function(d,i){ probs[d]=i===0?remaining-split*(others.length-1):split; });
          var sorted=Object.keys(probs).sort(function(a,b){ return probs[b]-probs[a]; });
          var bColors=['var(--primary)','#6366f1','#8b5cf6','#a78bfa','#c4b5fd'];
          sorted.forEach(function(dis,i){
            var pct=probs[dis];
            var row=document.createElement('div');
            row.style.cssText='display:flex;align-items:center;gap:8px;font-size:.78rem;';
            row.innerHTML='<span style="width:130px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+dis+'</span>'
              +'<div style="flex:1;background:#e2e8f0;border-radius:4px;height:7px;overflow:hidden;">'
              +'<div style="height:100%;border-radius:4px;background:'+bColors[i]+';width:0%;transition:width 1s ease '+(i*0.1)+'s" data-w="'+pct+'"></div></div>'
              +'<span style="width:36px;text-align:right;font-weight:600;color:var(--secondary)">'+pct+'%</span>';
            probBars.appendChild(row);
          });
          setTimeout(function(){ probBars.querySelectorAll('[data-w]').forEach(function(el){ el.style.width=el.getAttribute('data-w')+'%'; }); },100);
        }

        // Heatmap visualization
        var beforeImg=document.getElementById('vizBeforeImg');
        var beforePh=document.getElementById('vizBeforePlaceholder');
        if(beforeImg&&previewImage&&previewImage.src){ beforeImg.src=previewImage.src; beforeImg.style.display='block'; if(beforePh) beforePh.style.display='none'; }
        var canvas=document.getElementById('heatmapCanvas');
        var afterPh=document.getElementById('vizAfterPlaceholder');
        if(canvas&&beforeImg&&beforeImg.src){
          canvas.style.display='block'; if(afterPh) afterPh.style.display='none';
          var ctx2=canvas.getContext('2d');
          var cw=canvas.offsetWidth||200, ch=canvas.offsetHeight||130;
          canvas.width=cw; canvas.height=ch;
          var tmpImg=new Image();
          tmpImg.onload=function(){
            ctx2.drawImage(tmpImg,0,0,cw,ch);
            var cx=cw*0.5,cy=ch*0.45,r=Math.min(cw,ch)*0.38;
            var grad=ctx2.createRadialGradient(cx,cy,0,cx,cy,r);
            grad.addColorStop(0,'rgba(255,0,0,0.75)'); grad.addColorStop(0.3,'rgba(255,140,0,0.6)');
            grad.addColorStop(0.6,'rgba(255,255,0,0.35)'); grad.addColorStop(0.85,'rgba(0,100,255,0.2)');
            grad.addColorStop(1,'rgba(0,0,128,0.05)');
            ctx2.fillStyle=grad; ctx2.fillRect(0,0,cw,ch);
          };
          tmpImg.src=beforeImg.src;
        }

        // Explanation
        document.getElementById('explanationText').textContent=data.explanation;

        // Diagnosis details
        var DETAILS={'Melanoma':['Asymmetric border detected by AI model','Color variation and irregular pigmentation identified','Diameter exceeds 6mm threshold','ABCDE criteria partially met'],'Nevus':['Symmetric, well-defined border observed','Uniform pigmentation detected','No irregular features identified','Benign characteristics confirmed'],'Basal Cell Carcinoma':['Pearly or waxy appearance detected','Rolled border pattern identified','Possible ulceration markers present','Sun-exposed area pattern noted'],'Psoriasis':['Scaly plaque pattern identified','Erythematous base detected','Silvery scale characteristics noted','Chronic inflammatory markers present'],'Eczema':['Dry, inflamed skin pattern detected','Pruritic lesion characteristics noted','Possible allergen-triggered response','Atopic dermatitis markers identified']};
        var diagList=document.getElementById('diagDetailsList');
        if(diagList){ diagList.innerHTML=''; (DETAILS[data.disease]||['AI analysis completed','Pattern recognition applied']).forEach(function(d){ var li=document.createElement('li'); li.style.cssText='display:flex;align-items:flex-start;gap:8px;font-size:.84rem;color:var(--text-main);'; li.innerHTML='<span style="color:var(--primary);font-size:1rem;line-height:1.2">•</span>'+d; diagList.appendChild(li); }); }

        // Risk factors
        var RFACTORS={'Melanoma':['UV Exposure','Family History','Fair Skin','Irregular Mole'],'Nevus':['Sun Exposure','Genetic Predisposition'],'Basal Cell Carcinoma':['Chronic Sun Damage','Age > 50','Fair Complexion','Radiation History'],'Psoriasis':['Immune System','Stress','Genetics','Infections'],'Eczema':['Allergens','Dry Skin','Stress','Irritants']};
        var rfEl=document.getElementById('riskFactors');
        if(rfEl){ rfEl.innerHTML=''; (RFACTORS[data.disease]||['Skin Condition']).forEach(function(f){ var s=document.createElement('span'); s.style.cssText='padding:4px 10px;background:#ede9fe;color:#5b21b6;border-radius:20px;font-size:.78rem;font-weight:600;'; s.textContent=f; rfEl.appendChild(s); }); }

        // Treatment suggestions
        var sl=document.getElementById('suggestionList'); sl.innerHTML='';
        data.suggestions.forEach(function(s,i){
          var li=document.createElement('li');
          li.style.cssText='display:flex;align-items:flex-start;gap:10px;font-size:.85rem;color:var(--text-main);';
          li.innerHTML='<span style="width:22px;height:22px;border-radius:50%;background:#dcfce7;color:#16a34a;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;flex-shrink:0">'+(i+1)+'</span>'+s;
          sl.appendChild(li);
        });

        // Next steps
        var NEXT={'Melanoma':'Schedule urgent dermatologist appointment within 1-2 weeks. Biopsy may be required for definitive diagnosis.','Nevus':'Monitor monthly for any changes in size, shape or color. Annual dermatology check recommended.','Basal Cell Carcinoma':'Consult a dermatologist within 2-4 weeks. Surgical excision is typically the first-line treatment.','Psoriasis':'Begin topical corticosteroid therapy. Consult dermatologist for phototherapy options if severe.','Eczema':'Apply emollient moisturizer twice daily. Identify and avoid triggers. Consult if symptoms persist.'};
        var nsEl=document.getElementById('nextSteps');
        if(nsEl) nsEl.textContent=NEXT[data.disease]||'Consult a qualified dermatologist for further evaluation.';

        window._lastDiag=data;
        loadTables();
        // Returning patient notification
        if(data.is_returning) {
          showToast('Visit #' + data.visit_count + ' for ' + patName + '. Previous: ' + (data.previous_disease||'N/A'), 'success');
        } else {
          showToast('Diagnosis complete!','success');
        }
        // Clear existing patient prefill
        var ep=document.getElementById('existingPatientId');
        if(ep) ep.value='';
        var pidEl=document.getElementById('patIdDisplay');
        if(pidEl){ pidEl.style.color='#94a3b8'; pidEl.style.fontWeight=''; }
        if(panel) panel.scrollIntoView({behavior:'smooth',block:'start'});
      })
      .catch(function(e){ if(overlay) overlay.style.display='none'; showToast('Error: '+e.message,'error'); });
    });
  }

  /* ── download report ── */
  var dlBtn=document.getElementById('downloadReportBtn');
  if(dlBtn){
    dlBtn.addEventListener('click',function(){
      if(!window._lastDiag){ showToast('Run a diagnosis first.','error'); return; }
      var d=window._lastDiag;
      var calLine = d.calibrated_confidence != null
        ? 'Calibrated Confidence: '+d.calibrated_confidence+'%'
        : 'Calibrated Confidence: N/A (insufficient calibration data)';
      var txt=['DERMAI AGENT - DIAGNOSIS REPORT','================================',
        'Date: '+d.date,'Diagnosis ID: '+d.diag_id,'Patient ID: '+d.patient_id,'',
        'Predicted Disease: '+d.disease,'Risk Level: '+d.risk,
        'Raw Model Confidence: '+d.confidence+'%',
        calLine,'',
        'MEDICAL EXPLANATION','-------------------',d.explanation,'',
        'TREATMENT SUGGESTIONS','---------------------',d.suggestions.join('\n'),'',
        'DISCLAIMER: AI-assisted tool. Confidence scores reflect model probability estimates.',
        'A higher confidence score does NOT indicate clinical improvement.',
        'Consult a qualified dermatologist for medical advice.'].join('\n');
      var blob=new Blob([txt],{type:'text/plain'});
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a'); a.href=url; a.download='diagnosis_'+d.diag_id+'.txt';
      a.click(); URL.revokeObjectURL(url);
    });
  }

  /* ── data stores ── */
  var allPatients=[], allDiagnoses=[];

  /* ── load tables ── */
  function loadTables(){
    fetch('/api/patients').then(function(r){return r.json();}).then(function(p){
      allPatients=p; renderPatients(p);
      var pi=document.querySelector('#patients-content .page-info');
      if(pi) pi.textContent='Showing '+p.length+' of '+p.length+' patients';
    });
    fetch('/api/diagnoses').then(function(r){return r.json();}).then(function(d){
      allDiagnoses=d; renderHistory(d);
      updateDashboard(d); updateReportStats(d);
      var hi=document.querySelector('#history-content .page-info');
      if(hi) hi.textContent='Showing '+d.length+' of '+d.length+' records';
    });
    fetch('/api/stats').then(function(r){return r.json();}).then(function(s){
      var m=document.querySelectorAll('#reports-content .metric-value');
      if(m.length>=4){ m[0].textContent=s.total_diagnoses||0; m[1].textContent=s.high_risk||0; m[2].textContent=(s.avg_confidence||0)+'%'; m[3].textContent=s.total_diagnoses||0; }
    });
  }

  function renderPatients(list){
    var b=document.getElementById('patientsTableBody'); if(!b) return;
    if(!list.length){ b.innerHTML='<tr><td colspan="7" style="text-align:center;color:#64748b;padding:30px">No patients yet.</td></tr>'; return; }
    b.innerHTML='';
    list.forEach(function(p){
      b.innerHTML+='<tr><td>'+p.patient_id+'</td><td>'+p.name+'</td><td>'+p.age+'</td><td>'+p.gender+'</td><td>'+p.phone+'</td><td>'+p.last_visit+'</td>'
        +'<td><button class="action-icon" onclick="viewPatient(\''+p.patient_id+'\')">&#128065;</button></td></tr>';
    });
  }

  function renderHistory(list){
    var b=document.getElementById('historyTableBody'); if(!b) return;
    if(!list.length){ b.innerHTML='<tr><td colspan="7" style="text-align:center;color:#64748b;padding:30px">No diagnoses yet.</td></tr>'; return; }
    var cm={'Melanoma':'#ef4444','Nevus':'#10b981','Psoriasis':'#f59e0b','Basal Cell Carcinoma':'#8b5cf6','Eczema':'#3b82f6'};
    b.innerHTML='';
    list.forEach(function(d){
      var col=cm[d.disease]||'#3b82f6';
      var img=d.image_path?'<img src="/'+d.image_path+'" style="width:40px;height:40px;object-fit:cover;border-radius:4px">':'<span style="color:#94a3b8">—</span>';
      b.innerHTML+='<tr><td>'+d.diag_id+'</td><td>'+d.patient_id+'</td><td>'+img+'</td>'
        +'<td><span style="color:'+col+';font-weight:600">'+d.disease+'</span></td>'
        +'<td>'+d.confidence+'%</td><td>'+d.date+'</td>'
        +'<td><button class="action-icon" onclick="viewDiagnosis(\''+d.diag_id+'\')">&#128065;</button></td></tr>';
    });
  }

  function updateDashboard(diags){
    // username
    var nameEl=document.getElementById('db-username');
    if(nameEl) nameEl.textContent=(CURRENT_USER?CURRENT_USER.name:'User')+' 👋';

    // total diagnoses
    var tdEl=document.getElementById('db-total-diag');
    if(tdEl) tdEl.textContent=diags.length;

    // reports count (same as diagnoses for now)
    var rpEl=document.getElementById('db-reports');
    if(rpEl) rpEl.textContent=diags.length;

    // profile status
    var psEl=document.getElementById('db-profile-status');
    if(psEl){
      var hasPhone=CURRENT_USER&&CURRENT_USER.phone&&CURRENT_USER.phone.length>0;
      psEl.textContent=hasPhone?'Complete':'Incomplete';
      psEl.style.color=hasPhone?'#059669':'#ea580c';
    }

    // last diagnosis
    var ldEl=document.getElementById('db-last-diag');
    if(ldEl){
      if(!diags.length){ ldEl.textContent='No diagnoses'; }
      else {
        var last=diags[0];
        var daysAgo=Math.floor((Date.now()-new Date(last.date).getTime())/(1000*60*60*24));
        ldEl.textContent=isNaN(daysAgo)?last.date:(daysAgo===0?'Today':daysAgo===1?'1 Day Ago':daysAgo+' Days Ago');
      }
    }

    // health score ring — based on avg confidence
    var scoreEl=document.getElementById('db-score-pct');
    var ringEl=document.getElementById('db-ring');
    if(scoreEl&&ringEl){
      var score=0;
      if(diags.length){
        var sum=0; diags.forEach(function(d){sum+=d.confidence;}); score=Math.round(sum/diags.length);
        // penalise high risk
        var highRisk=diags.filter(function(d){return d.risk==='High Risk';}).length;
        score=Math.max(0,score-highRisk*5);
      }
      scoreEl.textContent=diags.length?score+'%':'—';
      var circumference=2*Math.PI*50; // r=50
      var offset=circumference-(circumference*score/100);
      ringEl.style.strokeDasharray=circumference;
      ringEl.style.strokeDashoffset=diags.length?offset:circumference;
      // colour ring by score
      ringEl.style.stroke=score>=80?'#4f46e5':score>=60?'#f59e0b':'#ef4444';
    }

    // health tips — update if high risk found
    var tipsEl=document.getElementById('db-health-tips');
    if(tipsEl&&diags.length){
      var hasHighRisk=diags.some(function(d){return d.risk==='High Risk';});
      if(hasHighRisk){
        tipsEl.querySelector('.db-tip:first-child .db-tip-title').textContent='High Risk Detected';
        tipsEl.querySelector('.db-tip:first-child .db-tip-sub').textContent='Please consult a dermatologist immediately.';
        tipsEl.querySelector('.db-tip:first-child .db-tip-icon').textContent='⚠️';
        tipsEl.querySelector('.db-tip:first-child .db-tip-icon').style.background='#fee2e2';
      }
    }

    // recent diagnoses list
    var listEl=document.getElementById('db-recent-list');
    if(listEl){
      if(!diags.length){
        listEl.innerHTML='<div style="text-align:center;color:#94a3b8;padding:30px 0;font-size:.9rem">No diagnoses yet. Run your first diagnosis!</div>';
      } else {
        var cm={'Melanoma':'red','Nevus':'green','Psoriasis':'orange','Basal Cell Carcinoma':'orange','Eczema':'green'};
        listEl.innerHTML='';
        diags.slice(0,5).forEach(function(d){
          var cls=cm[d.disease]||'green';
          var imgHtml=d.image_path
            ?'<img src="/'+d.image_path+'" alt="">'
            :'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
          var row=document.createElement('div');
          row.className='db-diag-item';
          row.innerHTML='<div class="db-diag-img">'+imgHtml+'</div>'
            +'<div class="db-diag-info"><div class="db-diag-name">'+d.disease+'</div><div class="db-diag-date">'+d.date+'</div></div>'
            +'<span class="db-diag-conf '+cls+'">Confidence: '+d.confidence+'%</span>'
            +'<span class="db-diag-arrow">›</span>';
          row.addEventListener('click',function(){ if(window.viewDiagnosis) viewDiagnosis(d.diag_id); });
          listEl.appendChild(row);
        });
      }
    }

    // reminder sub text
    var rem1Sub=document.getElementById('db-rem1-sub');
    var rem1Date=document.getElementById('db-rem1-date');
    if(rem1Sub&&rem1Date&&diags.length){
      rem1Sub.textContent='For '+diags[0].disease;
      // set follow-up date = 7 days after last diagnosis
      var followUp=new Date(diags[0].date);
      if(!isNaN(followUp.getTime())){
        followUp.setDate(followUp.getDate()+7);
        rem1Date.textContent=followUp.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
      }
    }
  }

  function updateReportStats(diags){
    if(!diags.length||!window._userPieChart) return;
    var dc={};
    diags.forEach(function(d){ dc[d.disease]=(dc[d.disease]||0)+1; });
    var labels=Object.keys(dc), data=labels.map(function(l){return dc[l];});
    window._userPieChart.data.labels=labels;
    window._userPieChart.data.datasets[0].data=data;
    window._userPieChart.update();
  }

  /* ── view patient ── */
  window.viewPatient=function(id){
    var p=allPatients.find(function(x){return x.patient_id===id;}); if(!p) return;
    infoModal('Patient — '+p.patient_id,
      '<table style="width:100%;border-collapse:collapse;font-size:.9rem">'
      +'<tr><td style="padding:8px;color:#64748b;width:110px">ID</td><td style="padding:8px;font-weight:600">'+p.patient_id+'</td></tr>'
      +'<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Name</td><td style="padding:8px">'+p.name+'</td></tr>'
      +'<tr><td style="padding:8px;color:#64748b">Age</td><td style="padding:8px">'+p.age+'</td></tr>'
      +'<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Gender</td><td style="padding:8px">'+p.gender+'</td></tr>'
      +'<tr><td style="padding:8px;color:#64748b">Phone</td><td style="padding:8px">'+p.phone+'</td></tr>'
      +'<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Last Visit</td><td style="padding:8px">'+p.last_visit+'</td></tr>'
      +'</table>');
  };

  /* ── view diagnosis ── */
  window.viewDiagnosis=function(id){
    var d=allDiagnoses.find(function(x){return x.diag_id===id;}); if(!d) return;
    var rc=d.risk==='High Risk'?'#ef4444':d.risk==='Medium Risk'?'#f59e0b':'#10b981';
    var img=d.image_path?'<img src="/'+d.image_path+'" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:12px">':'';
    var calRow = d.calibrated_confidence != null
      ? '<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Calibrated Confidence</td><td style="padding:8px;font-weight:600;color:#4f46e5">'+d.calibrated_confidence+'%</td></tr>'
      : '<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Calibrated Confidence</td><td style="padding:8px;color:#94a3b8;font-size:.8rem">Unavailable — insufficient calibration data</td></tr>';
    infoModal('Diagnosis — '+d.diag_id, img
      +'<table style="width:100%;border-collapse:collapse;font-size:.9rem">'
      +'<tr><td style="padding:8px;color:#64748b;width:160px">Disease</td><td style="padding:8px;font-weight:700;color:'+rc+'">'+d.disease+'</td></tr>'
      +'<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Risk</td><td style="padding:8px;color:'+rc+';font-weight:600">'+d.risk+'</td></tr>'
      +'<tr><td style="padding:8px;color:#64748b">Raw Confidence</td><td style="padding:8px;font-weight:600">'+d.confidence+'%</td></tr>'
      +calRow
      +'<tr><td style="padding:8px;color:#64748b">Patient</td><td style="padding:8px">'+d.patient_id+'</td></tr>'
      +'<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Date</td><td style="padding:8px">'+d.date+'</td></tr>'
      +'<tr><td style="padding:8px;color:#64748b">Explanation</td><td style="padding:8px;line-height:1.5">'+(d.explanation||'—')+'</td></tr>'
      +'</table>'
      +'<div style="margin-top:14px;padding:10px 12px;background:#f0f4ff;border-radius:8px;font-size:.78rem;color:#64748b;border-left:3px solid #4f46e5">'
      +'<strong>About Confidence Scores:</strong> Raw confidence is the direct model output. Calibrated confidence is adjusted via Temperature Scaling to better reflect actual prediction reliability. '
      +'A higher confidence score does <strong>not</strong> indicate clinical improvement of the patient\'s condition.'
      +'</div>');
  };

  /* ── search patients ── */
  var ps=document.querySelector('#patients-content .search-box input');
  if(ps) ps.addEventListener('input',function(){
    var q=this.value.toLowerCase();
    renderPatients(allPatients.filter(function(p){ return (p.patient_id+p.name+p.gender).toLowerCase().includes(q); }));
  });

  /* ── search history ── */
  var hs=document.querySelector('#history-content .search-box input');
  if(hs) hs.addEventListener('input',function(){
    var q=this.value.toLowerCase();
    renderHistory(allDiagnoses.filter(function(d){ return (d.diag_id+d.patient_id+d.disease).toLowerCase().includes(q); }));
  });

  /* ── history filter button ── */
  var filterBtn=document.querySelector('#history-content .btn-outline');
  if(filterBtn){
    filterBtn.addEventListener('click',function(){
      infoModal('Filter History',
        '<div style="margin-bottom:12px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Disease</label>'
        +'<select id="fDisease" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem">'
        +'<option value="">All Diseases</option>'
        +'<option>Melanoma</option><option>Nevus</option><option>Basal Cell Carcinoma</option><option>Psoriasis</option><option>Eczema</option>'
        +'</select></div>'
        +'<div style="margin-bottom:12px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Risk Level</label>'
        +'<select id="fRisk" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem">'
        +'<option value="">All Risks</option><option>High Risk</option><option>Medium Risk</option><option>Low Risk</option>'
        +'</select></div>'
        +'<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">'
        +'<button onclick="document.getElementById(\'_imodal\').remove()" style="padding:9px 18px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-weight:600">Cancel</button>'
        +'<button id="_applyFilter" style="padding:9px 18px;background:#1e40af;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">Apply</button>'
        +'</div>');
      document.getElementById('_applyFilter').addEventListener('click',function(){
        var dis=document.getElementById('fDisease').value;
        var risk=document.getElementById('fRisk').value;
        var filtered=allDiagnoses.filter(function(d){
          return (!dis||d.disease===dis)&&(!risk||d.risk===risk);
        });
        renderHistory(filtered);
        document.getElementById('_imodal').remove();
        showToast('Filter applied — '+filtered.length+' records','success');
      });
    });
  }

  /* ── add patient button ── */
  var addPatBtn=document.querySelector('#patients-content .btn-primary');
  if(addPatBtn){
    addPatBtn.addEventListener('click',function(){
      infoModal('Add New Patient',
        '<div style="margin-bottom:12px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Full Name *</label>'
        +'<input id="apName" type="text" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem" placeholder="Patient full name"></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">'
        +'<div><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Age *</label>'
        +'<input id="apAge" type="number" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem" placeholder="Age"></div>'
        +'<div><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Gender</label>'
        +'<select id="apGender" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem"><option>Female</option><option>Male</option><option>Other</option></select></div></div>'
        +'<div style="margin-bottom:12px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Phone</label>'
        +'<input id="apPhone" type="text" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem" placeholder="+1 555-000-0000"></div>'
        +'<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">'
        +'<button onclick="document.getElementById(\'_imodal\').remove()" style="padding:9px 18px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-weight:600">Cancel</button>'
        +'<button id="_savePatient" style="padding:9px 18px;background:#1e40af;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">Save Patient</button>'
        +'</div>');
      document.getElementById('_savePatient').addEventListener('click',function(){
        var name=document.getElementById('apName').value.trim();
        var age=document.getElementById('apAge').value;
        var gender=document.getElementById('apGender').value;
        var phone=document.getElementById('apPhone').value.trim();
        if(!name||!age){ showToast('Name and Age are required.','error'); return; }
        fetch('/api/patients/add',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({name:name,age:age,gender:gender,phone:phone})})
        .then(function(r){return r.json();})
        .then(function(data){
          if(data.success){
            showToast('Patient '+name+' added! ID: '+data.patient_id,'success');
            document.getElementById('_imodal').remove();
            loadTables();
          } else { showToast(data.message||'Failed.','error'); }
        });
      });
    });
  }

  /* ── reports: populate selects + live preview + generate ── */
  var PRECAUTIONS = {
    'Melanoma':             ['Avoid direct sun exposure and use SPF 50+ sunscreen daily','Wear protective clothing and wide-brim hats outdoors','Do not scratch or pick the lesion','Schedule urgent biopsy appointment','Monitor for any rapid changes in size or color'],
    'Nevus':                ['Avoid scratching or picking the mole','Avoid direct and prolonged sun exposure','Wear protective clothing and hats when outside','Perform regular self-skin checks','Consult a specialist if any unusual changes occur'],
    'Basal Cell Carcinoma': ['Minimize UV exposure — avoid peak sun hours (10am–4pm)','Apply broad-spectrum SPF 30+ sunscreen daily','Do not delay surgical consultation','Avoid tanning beds completely','Protect treated area from sun post-procedure'],
    'Psoriasis':            ['Avoid known triggers (stress, alcohol, certain medications)','Keep skin moisturized — apply emollient twice daily','Avoid hot showers; use lukewarm water','Do not scratch plaques — this worsens inflammation','Follow prescribed treatment regimen consistently'],
    'Eczema':               ['Avoid harsh soaps, detergents and fragrances','Keep skin moisturized with fragrance-free emollient','Wear soft, breathable cotton clothing','Avoid extreme temperatures and humidity changes','Identify and eliminate personal allergen triggers']
  };
  var DOCTOR_NOTES = {
    'Melanoma':             'Urgent dermatologist referral recommended. Biopsy required for definitive staging. Patient should avoid sun exposure until further evaluation.',
    'Nevus':                'Regular monitoring is recommended. Follow up in 6 months or earlier if any changes occur. No immediate intervention required.',
    'Basal Cell Carcinoma': 'Surgical excision consultation recommended within 2-4 weeks. Mohs surgery may be considered depending on lesion location and size.',
    'Psoriasis':            'Initiate topical corticosteroid therapy. Consider phototherapy referral if >10% BSA involvement. Follow up in 4 weeks.',
    'Eczema':               'Prescribe topical emollient and mild corticosteroid for flare management. Allergy testing may be beneficial. Review in 3-4 weeks.'
  };

  function populateReportSelects() {
    var patSel  = document.getElementById('rptPatientSelect');
    var diagSel = document.getElementById('rptDiagSelect');
    if (!patSel || !diagSel) return;

    // Populate patients
    patSel.innerHTML = '<option value="">— Select a patient —</option>';
    allPatients.forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p.patient_id;
      opt.textContent = p.name + ' — ID: ' + p.patient_id;
      patSel.appendChild(opt);
    });

    // When patient changes, filter diagnoses
    patSel.onchange = function() {
      var pid = this.value;
      diagSel.innerHTML = '<option value="">— Select a diagnosis —</option>';
      var filtered = pid ? allDiagnoses.filter(function(d) { return d.patient_id === pid; }) : allDiagnoses;
      filtered.forEach(function(d) {
        var opt = document.createElement('option');
        opt.value = d.diag_id;
        opt.textContent = d.disease + ' — ' + d.date;
        diagSel.appendChild(opt);
      });
      updatePreview();
    };

    diagSel.onchange = updatePreview;
  }

  function updatePreview() {
    var pid    = document.getElementById('rptPatientSelect').value;
    var diagId = document.getElementById('rptDiagSelect').value;
    var empty  = document.getElementById('rptEmptyState');
    var body   = document.getElementById('rptBody');
    if (!pid || !diagId) { if(empty) empty.style.display='block'; if(body) body.style.display='none'; return; }

    var p = allPatients.find(function(x) { return x.patient_id === pid; });
    var d = allDiagnoses.find(function(x) { return x.diag_id === diagId; });
    if (!p || !d) return;

    if(empty) empty.style.display='none';
    if(body)  body.style.display='block';

    // Date
    var now = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    var genDate = document.getElementById('rptGenDate');
    if(genDate) genDate.textContent = 'Generated on: ' + now;

    // Section visibility
    document.getElementById('rptSec1').style.display = document.getElementById('rptSecPatient').checked ? '' : 'none';
    document.getElementById('rptSec2').style.display = document.getElementById('rptSecDiag').checked    ? '' : 'none';
    document.getElementById('rptSec3').style.display = document.getElementById('rptSecAI').checked      ? '' : 'none';
    document.getElementById('rptSec4').style.display = document.getElementById('rptSecRec').checked     ? '' : 'none';
    document.getElementById('rptSec5').style.display = document.getElementById('rptSecPrec').checked    ? '' : 'none';
    document.getElementById('rptSec6').style.display = document.getElementById('rptSecNotes').checked   ? '' : 'none';

    // 1. Patient info
    document.getElementById('rptPName').textContent = p.name;
    document.getElementById('rptPID').textContent   = p.patient_id;
    document.getElementById('rptPAge').textContent  = p.age + ' / ' + p.gender;
    document.getElementById('rptPDate').textContent = now;

    // 2. Diagnosis details
    var imgEl = document.getElementById('rptDiagImg');
    if(d.image_path){ imgEl.src='/'+d.image_path; imgEl.style.display='block'; } else { imgEl.style.display='none'; }
    document.getElementById('rptDDisease').textContent = d.disease;
    document.getElementById('rptDDate').textContent    = d.date;
    document.getElementById('rptDConf').textContent    = d.confidence + '%';
    var riskEl = document.getElementById('rptDRisk');
    riskEl.textContent  = d.risk;
    riskEl.style.color  = d.risk==='High Risk'?'#ef4444':d.risk==='Medium Risk'?'#f59e0b':'#10b981';

    // calibrated confidence in report
    var calConfRptEl = document.getElementById('rptDCalConf');
    if(calConfRptEl){
      if(d.calibrated_confidence != null){
        calConfRptEl.textContent = d.calibrated_confidence + '%';
        calConfRptEl.style.color = '#4f46e5';
      } else {
        calConfRptEl.textContent = 'N/A — insufficient calibration data';
        calConfRptEl.style.color = '#94a3b8';
      }
    }

    // 3. AI Analysis
    document.getElementById('rptAIText').textContent = d.explanation || '—';

    // 4. Recommendations
    var recList = document.getElementById('rptRecList');
    recList.innerHTML = '';
    var suggs = [];
    try { suggs = JSON.parse(d.suggestions||'[]'); } catch(e) { suggs = [d.suggestions||'']; }
    suggs.forEach(function(s) {
      var li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:flex-start;gap:8px;font-size:.83rem;color:var(--text-main)';
      li.innerHTML = '<span style="color:#10b981;font-size:.9rem;margin-top:1px">●</span>' + s;
      recList.appendChild(li);
    });

    // 5. Precautions
    var precList = document.getElementById('rptPrecList');
    precList.innerHTML = '';
    (PRECAUTIONS[d.disease]||[]).forEach(function(s) {
      var li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:flex-start;gap:8px;font-size:.83rem;color:var(--text-main)';
      li.innerHTML = '<span style="color:#f59e0b;font-size:.9rem;margin-top:1px">●</span>' + s;
      precList.appendChild(li);
    });

    // 6. Doctor Notes
    var notes = document.getElementById('rptNotes').value.trim();
    document.getElementById('rptNotesPreview').textContent = notes || (DOCTOR_NOTES[d.disease] || 'Regular monitoring is recommended.');
  }

  // Wire checkboxes to live-update preview
  ['rptSecPatient','rptSecDiag','rptSecAI','rptSecRec','rptSecPrec','rptSecNotes'].forEach(function(id) {
    var el = document.getElementById(id);
    if(el) el.addEventListener('change', updatePreview);
  });

  // Notes character counter
  var rptNotesEl = document.getElementById('rptNotes');
  var rptNotesCount = document.getElementById('rptNotesCount');
  if(rptNotesEl) {
    rptNotesEl.addEventListener('input', function() {
      if(rptNotesCount) rptNotesCount.textContent = this.value.length + '/300';
      updatePreview();
    });
  }

  // Generate Report button
  var generateReportBtn = document.getElementById('generateReportBtn');
  if(generateReportBtn) {
    generateReportBtn.addEventListener('click', function() {
      var pid    = document.getElementById('rptPatientSelect').value;
      var diagId = document.getElementById('rptDiagSelect').value;
      if(!pid || !diagId) { showToast('Please select a patient and diagnosis first.', 'error'); return; }
      updatePreview();
      showToast('Report generated! Click Download PDF to save.', 'success');
    });
  }

  // Download PDF button — builds a printable HTML and triggers print/save
  var downloadPdfBtn = document.getElementById('downloadPdfBtn');
  if(downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', function() {
      var body = document.getElementById('rptBody');
      if(!body || body.style.display==='none') { showToast('Generate a report first.', 'error'); return; }
      var preview = document.getElementById('reportPreview');
      var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>DermAI Report</title>'
        + '<style>body{font-family:Inter,sans-serif;padding:32px;color:#0f172a;font-size:13px;line-height:1.6}'
        + 'h1{font-size:18px;margin-bottom:4px} .sec-title{color:#4f46e5;font-weight:700;font-size:13px;margin:16px 0 8px}'
        + 'table{border-collapse:collapse;width:100%} td{padding:4px 0} .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;font-style:italic}'
        + 'ul{list-style:none;padding:0;margin:0} li{margin-bottom:4px}'
        + '</style></head><body>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #4f46e5;padding-bottom:12px;margin-bottom:16px">'
        + '<div><strong style="font-size:16px">DermAI</strong><div style="font-size:10px;color:#64748b">AI-Powered Dermatology</div></div>'
        + '<div style="text-align:right"><strong>Patient Report</strong><div style="font-size:11px;color:#64748b">' + (document.getElementById('rptGenDate').textContent) + '</div></div></div>'
        + preview.innerHTML
        + '</body></html>';
      var blob = new Blob([html], {type:'text/html'});
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href   = url;
      a.download = 'DermAI_Report_' + (document.getElementById('rptPID').textContent || 'patient') + '_' + Date.now() + '.html';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Report downloaded!', 'success');
    });
  }

  // Populate selects when tables load
  var _origLoadTables = loadTables;
  function loadTablesWithReport() {
    _origLoadTables();
    setTimeout(populateReportSelects, 500);
  }
  loadTables = loadTablesWithReport;

  /* ── profile: save ── */
  var saveBtn=document.getElementById('saveProfileBtn');
  if(saveBtn){
    saveBtn.addEventListener('click',function(){
      var name=document.getElementById('profileName').value.trim();
      var phone=document.getElementById('profilePhone').value.trim();
      if(!name){ showToast('Name cannot be empty.','error'); return; }
      fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:name,phone:phone})})
      .then(function(r){return r.json();})
      .then(function(data){
        if(data.success){
          showToast('Profile updated!','success');
          document.querySelectorAll('.user-name').forEach(function(el){el.textContent=name;});
          document.querySelectorAll('.profile-avatar').forEach(function(el){el.textContent=name.charAt(0).toUpperCase();});
          CURRENT_USER.name=name;
        } else { showToast(data.message||'Failed.','error'); }
      });
    });
  }

  /* ── profile: change password ── */
  document.querySelectorAll('.btn-outline').forEach(function(btn){
    if(btn.textContent.trim()==='Change Password'){
      btn.addEventListener('click',function(){ modal('changePwdModal'); });
    }
  });
  var cpForm=document.getElementById('changePwdForm');
  if(cpForm){
    cpForm.addEventListener('submit',function(e){
      e.preventDefault();
      var cur=document.getElementById('currentPwd').value;
      var np=document.getElementById('newPwd').value;
      var cp=document.getElementById('confirmPwd').value;
      if(np!==cp){ showToast('Passwords do not match.','error'); return; }
      if(np.length<6){ showToast('Min 6 characters.','error'); return; }
      fetch('/api/change-password',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({current_password:cur,new_password:np})})
      .then(function(r){return r.json();})
      .then(function(data){
        if(data.success){ showToast('Password changed!','success'); closeModal('changePwdModal'); cpForm.reset(); }
        else { showToast(data.message||'Failed.','error'); }
      });
    });
  }

  /* ── profile: change picture ── */
  var picInput=document.getElementById('profilePicInput');
  var changePicBtn=document.getElementById('changePictureBtn');
  if(changePicBtn){
    changePicBtn.addEventListener('click',function(){
      if(picInput) picInput.click();
    });
  }
  if(picInput){
    picInput.addEventListener('change',function(e){
      var file=e.target.files[0]; if(!file) return;
      if(file.size>2*1024*1024){ showToast('Max file size is 2MB.','error'); return; }
      var fd=new FormData(); fd.append('picture',file);
      fetch('/api/profile/picture',{method:'POST',body:fd})
      .then(function(r){return r.json();})
      .then(function(data){
        if(data.success){
          showToast('Profile picture updated!','success');
          // show preview in avatar circle
          var av=document.querySelector('#profile-content .profile-avatar');
          if(av){
            av.style.backgroundImage='url('+data.url+')';
            av.style.backgroundSize='cover';
            av.style.backgroundPosition='center';
            av.textContent='';
          }
        } else { showToast(data.message||'Upload failed.','error'); }
      });
    });
  }

  /* ── settings tabs (user) ── */
  // Remove the duplicate handler below — this is the only one needed
  var settingsTabs=document.querySelectorAll('#settings-content .settings-tab');
  var settingsPanels=document.querySelectorAll('#settings-content .settings-panel');
  settingsTabs.forEach(function(tab,i){
    tab.addEventListener('click',function(){
      settingsTabs.forEach(function(t){t.classList.remove('active');});
      tab.classList.add('active');
      settingsPanels.forEach(function(p,j){ p.style.display=j===i?'block':'none'; });
    });
  });

  /* ── settings save buttons (user) ── */
  document.querySelectorAll('#settings-content .settings-panel .btn-primary').forEach(function(btn){
    btn.addEventListener('click',function(){
      var panel=btn.closest('.settings-panel');
      var tabName=panel?panel.getAttribute('data-tab')||'Settings':'Settings';
      var data={};
      if(panel) panel.querySelectorAll('input,select,textarea').forEach(function(el){
        if(el.id) data[el.id]=el.type==='checkbox'?el.checked:el.value;
      });
      fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
      .then(function(r){return r.json();})
      .then(function(res){
        showToast(res.success?tabName+' settings saved!':'Save failed.',res.success?'success':'error');
      });
    });
  });

  /* ── charts ── */
  var trendCtx=document.getElementById('userTrendChart');
  if(trendCtx){
    new Chart(trendCtx.getContext('2d'),{
      type:'line',
      data:{labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        datasets:[{label:'Diagnoses',data:[12,19,15,25,22,30,28],borderColor:'#1e40af',
          backgroundColor:'rgba(30,64,175,.1)',tension:.4,fill:false,pointBackgroundColor:'#1e40af'}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}
    });
  }
  var pieCtx=document.getElementById('userPieChart');
  if(pieCtx){
    window._userPieChart=new Chart(pieCtx.getContext('2d'),{
      type:'doughnut',
      data:{labels:['Melanoma','Nevus','BCC','Psoriasis','Eczema'],
        datasets:[{data:[35.2,28.7,18.3,9.1,8.7],
          backgroundColor:['#1e40af','#ec4899','#f59e0b','#3b82f6','#ef4444'],borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'right'}}}
    });
  }

  /* ── initial load ── */
  loadTables();
  setTimeout(populateReportSelects, 600);

  /* ═════════════════════════════════════════════════════ */
  /* PATIENT PROFILE — visit tracking, comparison, history */
  /* ═════════════════════════════════════════════════════ */

  var _ppCurrentPatient = null;
  var _ppPatientId      = null;

  /* Search patients (debounced) */
  var ppSearchInput = document.getElementById('ppSearchInput');
  var ppSearchResults = document.getElementById('ppSearchResults');
  var ppSearchTimer = null;

  if (ppSearchInput) {
    ppSearchInput.addEventListener('input', function() {
      clearTimeout(ppSearchTimer);
      var q = this.value.trim();
      if (q.length < 2) { ppSearchResults.innerHTML = ''; return; }
      ppSearchTimer = setTimeout(function() {
        fetch('/api/patients/search?q=' + encodeURIComponent(q))
        .then(function(r) { return r.json(); })
        .then(function(list) {
          if (!list.length) { ppSearchResults.innerHTML = '<div style="padding:10px;color:#94a3b8;font-size:.85rem;">No patients found.</div>'; return; }
          ppSearchResults.innerHTML = list.map(function(p) {
            return '<div class="pp-sr-item" data-pid="' + p.patient_id + '" style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">'
              + '<div><div style="font-weight:600;font-size:.88rem;color:#0f172a;">' + p.name + '</div>'
              + '<div style="font-size:.75rem;color:#94a3b8;">' + p.patient_id + ' · ' + (p.visit_count||1) + ' visit(s) · Last: ' + (p.last_visit||'—') + '</div></div>'
              + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>'
              + '</div>';
          }).join('');
          ppSearchResults.querySelectorAll('.pp-sr-item').forEach(function(el) {
            el.addEventListener('mouseenter', function() { this.style.background = '#f8faff'; });
            el.addEventListener('mouseleave', function() { this.style.background = '#fff'; });
            el.addEventListener('click', function() {
              var pid = this.getAttribute('data-pid');
              ppSearchResults.innerHTML = '';
              ppSearchInput.value = '';
              loadPatientProfile(pid);
            });
          });
        });
      }, 300);
    });
  }

  /* Direct ID load */
  var ppLoadBtn = document.getElementById('ppLoadBtn');
  if (ppLoadBtn) {
    ppLoadBtn.addEventListener('click', function() {
      var pid = document.getElementById('ppDirectId').value.trim();
      if (!pid) { showToast('Enter a Patient ID.', 'error'); return; }
      loadPatientProfile(pid);
    });
  }

  function loadPatientProfile(pid) {
    _ppPatientId = pid;
    fetch('/api/patient/' + pid + '/history')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.success) { showToast(data.message || 'Patient not found.', 'error'); return; }
      var p = data.patient;
      var diags = data.diagnoses || [];
      _ppCurrentPatient = p;

      document.getElementById('ppEmpty').style.display = 'none';
      document.getElementById('ppProfileCard').style.display = 'block';

      document.getElementById('ppId').textContent = p.patient_id;
      document.getElementById('ppName').textContent = p.name;
      document.getElementById('ppAgeGender').textContent = (p.age||'—') + ' / ' + (p.gender||'—');
      document.getElementById('ppVisits').textContent = p.visit_count || diags.length || 1;
      document.getElementById('ppFirstVisit').textContent = p.first_visit || (diags.length ? diags[0].date : '—');
      document.getElementById('ppLastVisit').textContent = p.last_visit || (diags.length ? diags[diags.length-1].date : '—');
      document.getElementById('ppPrevDiag').textContent = diags.length >= 2 ? diags[diags.length-2].disease : '—';
      document.getElementById('ppCurrDiag').textContent = diags.length >= 1 ? diags[diags.length-1].disease : '—';

      // Render timeline
      var tb = document.getElementById('ppTimelineBody');
      tb.innerHTML = '';
      if (!diags.length) {
        tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:20px;">No consultations yet.</td></tr>';
      } else {
        diags.forEach(function(d) {
          var vn = d.visit_number || 1;
          var img = d.image_path ? '<img src="/'+d.image_path+'" style="width:36px;height:36px;object-fit:cover;border-radius:6px;">' : '<span style="color:#cbd5e1">—</span>';
          var cal = d.calibrated_confidence != null ? d.calibrated_confidence + '%' : '<span style="color:#94a3b8">N/A</span>';
          var rc = d.risk === 'High Risk' ? '#ef4444' : d.risk === 'Medium Risk' ? '#f59e0b' : '#10b981';
          tb.innerHTML += '<tr style="border-bottom:1px solid #f1f5f9;">'
            + '<td style="padding:10px 8px;font-weight:700;color:var(--primary);">Visit ' + vn + '</td>'
            + '<td style="padding:10px 8px;">' + (d.date||'—') + '</td>'
            + '<td style="padding:10px 8px;">' + img + '</td>'
            + '<td style="padding:10px 8px;font-weight:600;color:' + rc + ';">' + (d.disease||'—') + '</td>'
            + '<td style="padding:10px 8px;">' + (d.confidence||0) + '%</td>'
            + '<td style="padding:10px 8px;">' + cal + '</td>'
            + '<td style="padding:10px 8px;"><span style="background:' + (rc==='#ef4444'?'#fee2e2':rc==='#f59e0b'?'#fef3c7':'#dcfce7') + ';color:' + rc + ';padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600;">' + (d.risk||'—') + '</span></td>'
            + '<td style="padding:10px 8px;"><button class="action-icon pp-view-report" data-id="' + d.diag_id + '" title="View Report">👁</button></td>'
            + '</tr>';
        });
      }

      // Compare button visibility
      var cmpBtn = document.getElementById('ppCompareBtn');
      if (cmpBtn) cmpBtn.style.display = diags.length >= 2 ? '' : 'none';

      // Store patient name for new-diagnosis prefill
      window._ppPrefillName = p.name;
      window._ppPrefillId = p.patient_id;
    });
  }

  /* Compare reports */
  var ppCompareBtn = document.getElementById('ppCompareBtn');
  if (ppCompareBtn) {
    ppCompareBtn.addEventListener('click', function() {
      if (!_ppPatientId) return;
      fetch('/api/patient/' + _ppPatientId + '/compare')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.success || !data.has_previous) { showToast('Not enough visits for comparison.', 'error'); return; }
        renderComparison(data.previous, data.current);
      });
    });
  }

  function renderComparison(prev, curr) {
    var panel = document.getElementById('ppComparePanel');
    var body  = document.getElementById('ppCompareBody');
    panel.style.display = 'block';

    var prevImg = prev.image_path ? '<img src="/'+prev.image_path+'" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;">' : '<span style="color:#94a3b8;">No image</span>';
    var currImg = curr.image_path ? '<img src="/'+curr.image_path+'" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;">' : '<span style="color:#94a3b8;">No image</span>';
    var diseaseChanged = prev.disease !== curr.disease;
    var rawDiff = (curr.confidence||0) - (prev.confidence||0);
    var calPrev = prev.calibrated_confidence != null ? prev.calibrated_confidence + '%' : 'N/A';
    var calCurr = curr.calibrated_confidence != null ? curr.calibrated_confidence + '%' : 'N/A';

    function row(label, prevVal, currVal) {
      return '<tr style="border-bottom:1px solid #f1f5f9;">'
        + '<td style="padding:10px 8px;color:#64748b;font-weight:600;width:160px;">' + label + '</td>'
        + '<td style="padding:10px 8px;">' + prevVal + '</td>'
        + '<td style="padding:10px 8px;">' + currVal + '</td></tr>';
    }

    body.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:.85rem;">'
      + '<thead><tr style="border-bottom:2px solid #e2e8f9;"><th style="text-align:left;padding:10px 8px;color:#64748b;">Parameter</th><th style="text-align:left;padding:10px 8px;color:#64748b;">Previous Report</th><th style="text-align:left;padding:10px 8px;color:#64748b;">Current Report</th></tr></thead><tbody>'
      + row('Visit Number', 'Visit ' + (prev.visit_number||1), 'Visit ' + (curr.visit_number||1))
      + row('Visit Date', prev.date||'—', curr.date||'—')
      + row('Skin Lesion Image', '<div style="width:120px;">'+prevImg+'</div>', '<div style="width:120px;">'+currImg+'</div>')
      + row('Predicted Condition',
           '<span style="font-weight:700;color:' + (prev.risk==='High Risk'?'#ef4444':prev.risk==='Medium Risk'?'#f59e0b':'#10b981') + ';">'+(prev.disease||'—')+'</span>',
           '<span style="font-weight:700;color:' + (curr.risk==='High Risk'?'#ef4444':curr.risk==='Medium Risk'?'#f59e0b':'#10b981') + ';">'+(curr.disease||'—')+'</span>')
      + row('Raw Confidence', (prev.confidence||0)+'%', (curr.confidence||0)+'%')
      + row('Calibrated Confidence', calPrev, calCurr)
      + row('Symptoms', prev.symptoms||'—', curr.symptoms||'—')
      + row('Recommendations', (prev.suggestions_list||[]).join('; ') || '—', (curr.suggestions_list||[]).join('; ') || '—')
      + '</tbody></table>';

    // Change indicators
    var changes = '<div style="margin-top:14px;display:flex;gap:12px;flex-wrap:wrap;">';
    changes += '<span style="padding:6px 12px;border-radius:8px;font-size:.78rem;font-weight:600;' + (diseaseChanged ? 'background:#fff7ed;color:#c2410c;' : 'background:#f0fdf4;color:#15803d;') + '">'
      + (diseaseChanged ? '⚠ Condition changed: '+prev.disease+' → '+curr.disease : '✓ Same condition: '+curr.disease) + '</span>';
    changes += '<span style="padding:6px 12px;border-radius:8px;font-size:.78rem;font-weight:600;background:#f0f4ff;color:#4f46e5;">'
      + 'Raw confidence ' + (rawDiff>=0?'+':'') + rawDiff + '%</span>';
    changes += '</div>';
    body.innerHTML += changes;

    panel.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  /* New Diagnosis for this patient */
  var ppNewDiagBtn = document.getElementById('ppNewDiagBtn');
  if (ppNewDiagBtn) {
    ppNewDiagBtn.addEventListener('click', function() {
      var nameEl = document.getElementById('patName');
      var idEl   = document.getElementById('patIdDisplay');
      if (nameEl && window._ppPrefillName) nameEl.value = window._ppPrefillName;
      if (idEl && window._ppPrefillId) {
        idEl.value = window._ppPrefillId;
        idEl.style.color = '#10b981';
        idEl.style.fontWeight = '600';
      }
      // Hidden field for existing patient
      var hidden = document.getElementById('existingPatientId');
      if (!hidden) {
        hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.id = 'existingPatientId';
        document.getElementById('patientForm').appendChild(hidden);
      }
      hidden.value = window._ppPrefillId || '';
      // Navigate to diagnosis
      var link = document.querySelector('.sidebar-menu a[data-target="new-diagnosis-content"]');
      if (link) link.click();
      showToast('Patient loaded. Submit diagnosis for Visit #' + ((parseInt(document.getElementById('ppVisits').textContent)||0)+1), 'success');
    });
  }

  /* Download history */
  var ppDlBtn = document.getElementById('ppDownloadHistBtn');
  if (ppDlBtn) {
    ppDlBtn.addEventListener('click', function() {
      if (!_ppPatientId) return;
      fetch('/api/patient/' + _ppPatientId + '/history')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.success) return;
        var p = data.patient;
        var diags = data.diagnoses || [];
        var lines = ['DERMAI AGENT - PATIENT HISTORY','================================',
          'Patient ID: ' + p.patient_id, 'Name: ' + p.name,
          'Age: ' + (p.age||'—'), 'Gender: ' + (p.gender||'—'),
          'Total Visits: ' + (p.visit_count||diags.length),
          'First Visit: ' + (p.first_visit||''), 'Last Visit: ' + (p.last_visit||''), '',
          'CONSULTATIONS','------------'];
        diags.forEach(function(d, i) {
          lines.push('Visit #' + (d.visit_number||i+1) + ' (' + (d.date||'') + ')');
          lines.push('  Disease: ' + (d.disease||'—'));
          lines.push('  Raw Confidence: ' + (d.confidence||0) + '%');
          lines.push('  Calibrated Confidence: ' + (d.calibrated_confidence!=null?d.calibrated_confidence+'%':'N/A'));
          lines.push('  Risk: ' + (d.risk||'—'));
          lines.push('  Symptoms: ' + (d.symptoms||'—'));
          lines.push('  Explanation: ' + (d.explanation||''));
          lines.push('');
        });
        lines.push('DISCLAIMER: AI-assisted tool. Consult a dermatologist for medical advice.');
        var blob = new Blob([lines.join('\n')], {type:'text/plain'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'patient_' + p.patient_id + '_history.txt';
        a.click(); URL.revokeObjectURL(url);
        showToast('History downloaded.', 'success');
      });
    });
  }

  /* View report from timeline */
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.pp-view-report');
    if (!btn) return;
    var diagId = btn.getAttribute('data-id');
    if (window.viewDiagnosis) viewDiagnosis(diagId);
  });

  /* Also send existing_patient_id in diagnose form */
  var analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', function() {
      // Already handled above - but ensure existing patient id is included
    }, true); // capture phase
  }

}); // end DOMContentLoaded
