/* Separate Apps Script project. Never add these routes to the full-state Planner service. */
function setupArtvac() {
  var props=PropertiesService.getScriptProperties();
  if(!props.getProperty('ARTVAC_WRITER_KEY'))props.setProperty('ARTVAC_WRITER_KEY',newArtvacToken_());
  if(!props.getProperty('ARTVAC_FOLDER_ID'))props.setProperty('ARTVAC_FOLDER_ID',DriveApp.createFolder('SENAI - publicacoes ARTVAC').getId());
  console.log('Chave de publicacao (somente para o painel da professora): '+props.getProperty('ARTVAC_WRITER_KEY'));
}
function newArtvacToken_(){return (Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'').toLowerCase();}
function artvacHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value)).map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');}
function artvacJson_(value){return ContentService.createTextOutput(JSON.stringify(Object.assign({service:'artvac-v1'},value))).setMimeType(ContentService.MimeType.JSON);}
function artvacString_(value,max){if(typeof value!=='string'||value.length>max)throw Error('invalid');return value;}
function artvacDate_(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('invalid');return value;}
function artvacEnum_(value,values){if(values.indexOf(value)<0)throw Error('invalid');return value;}
function artvacNumber_(value,max){if(!Number.isInteger(value)||value<0||value>max)throw Error('invalid');return value;}
function sanitizeArtvacReport_(raw){
  if(!raw||raw.version!==1||raw.company!=='ARTVAC'||raw.ready!==true)throw Error('invalid');
  var start=artvacDate_(raw.start),end=artvacDate_(raw.end),span=(Date.parse(end)-Date.parse(start))/86400000;
  if(span<0||span>92)throw Error('invalid');
  var days=[];for(var day=new Date(start+'T12:00:00Z');day.toISOString().slice(0,10)<=end;day.setUTCDate(day.getUTCDate()+1))if(day.getUTCDay()>0&&day.getUTCDay()<6)days.push(day.toISOString().slice(0,10));
  if(!days.length||JSON.stringify(raw.days)!==JSON.stringify(days)||!Array.isArray(raw.students)||!raw.students.length||raw.students.length>100)throw Error('invalid');
  var summary={students:raw.students.length,absentStudents:0,absences:0,justified:0,late:0,early:0,pendingCells:0},seen={};
  var students=raw.students.map(function(student){
    var name=artvacString_(student.name,160);if(!name.trim()||seen[name.toLowerCase()])throw Error('invalid');seen[name.toLowerCase()]=true;
    if(!Array.isArray(student.days)||student.days.length!==days.length)throw Error('invalid');
    var cells=student.days.map(function(cell,index){
      if(cell.date!==days[index])throw Error('invalid');
      var status=artvacEnum_(cell.status,['presente','falta','parcial','sem_aula']),expected=artvacNumber_(cell.expected,8),absent=artvacNumber_(cell.absent,expected),justified=artvacNumber_(cell.justified,absent);
      if((status==='sem_aula'&&(expected||absent))||(status!=='sem_aula'&&!expected)||(status==='presente'&&absent)||(status==='falta'&&absent!==expected)||(status==='parcial'&&(!absent||absent>=expected)))throw Error('invalid');
      var justification=artvacEnum_(cell.justification,['nao_informada','frequencia','informada','aguardando','apresentado']);
      if(!Array.isArray(cell.events)||cell.events.length>20)throw Error('invalid');
      var events=cell.events.map(function(event){
        var type=artvacEnum_(event.type,['atraso','saida','justificativa']),time=artvacString_(event.time,5);
        if(type!=='justificativa'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('invalid');
        if(type==='atraso')summary.late++;if(type==='saida')summary.early++;
        return {type:type,time:time,justification:artvacEnum_(event.justification,['nao_informada','informada','aguardando','apresentado']),document:artvacEnum_(event.document,['','atestado','declaracao','outro']),note:artvacString_(event.note,240)};
      });
      if(absent){summary.absences++;if(justified===absent)summary.justified++;}
      return {date:cell.date,status:status,expected:expected,absent:absent,justified:justified,justification:justification,events:events};
    });
    if(cells.some(function(cell){return cell.absent>0;}))summary.absentStudents++;
    return {name:name,days:cells};
  });
  if(!students.some(function(student){return student.days.some(function(cell){return cell.expected>0;});}))throw Error('invalid');
  var generatedAt=artvacString_(raw.generatedAt,40);if(!isFinite(Date.parse(generatedAt)))throw Error('invalid');
  return {version:1,company:'ARTVAC',className:artvacString_(raw.className,160),start:start,end:end,generatedAt:generatedAt,publishedAt:new Date().toISOString(),pointSentAt:raw.pointSentAt?artvacDate_(raw.pointSentAt):'',days:days,summary:summary,students:students,ready:true};
}
function doGet(event){
  try{
    var params=event.parameter||{},props=PropertiesService.getScriptProperties();
    if(params.action==='health')return artvacJson_({ok:true});
    if(params.action!=='read'||!/^[a-f0-9]{64}$/.test(params.token||''))return artvacJson_({ok:false,error:'access_denied'});
    var channelKey=props.getProperty('reader_'+artvacHash_(params.token));if(!channelKey)return artvacJson_({ok:false,error:'access_denied'});
    var channel=JSON.parse(props.getProperty(channelKey)||'null');if(!channel||channel.token!==params.token)return artvacJson_({ok:false,error:'access_denied'});
    var periods=Object.keys(channel.files).map(function(key){var meta=channel.files[key];return {key:key,start:meta.start,end:meta.end,publishedAt:meta.publishedAt};}).sort(function(a,b){return b.end.localeCompare(a.end)||b.publishedAt.localeCompare(a.publishedAt);});
    var selected=params.period&&channel.files[params.period]?params.period:periods[0]&&periods[0].key;
    if(!selected)return artvacJson_({ok:true,periods:[],report:null});
    if(!channel.files[selected])return artvacJson_({ok:false,error:'not_published'});
    var report=JSON.parse(DriveApp.getFileById(channel.files[selected].fileId).getBlob().getDataAsString('UTF-8'));
    return artvacJson_({ok:true,periods:periods,selected:selected,report:report});
  }catch(_){return artvacJson_({ok:false,error:'unavailable'});}
}
function doPost(event){
  var lock=LockService.getScriptLock();
  try{
    if(!event.postData||event.postData.contents.length>1000000)throw Error('invalid');
    var body=JSON.parse(event.postData.contents),props=PropertiesService.getScriptProperties(),secret=props.getProperty('ARTVAC_WRITER_KEY');
    if(!secret||typeof body.secret!=='string'||artvacHash_(body.secret)!==artvacHash_(secret))return artvacJson_({ok:false,error:'unauthorized'});
    if(body.action==='check')return artvacJson_({ok:true});
    var classId=artvacString_(body.classId,160);if(!classId)throw Error('invalid');
    if(!lock.tryLock(20000))throw Error('busy');
    var channelKey='class_'+artvacHash_(classId),channel=JSON.parse(props.getProperty(channelKey)||'null');
    if(body.action==='publish'){
      var report=sanitizeArtvacReport_(body.report),key=report.start+'_'+report.end;
      if(!channel)channel={token:newArtvacToken_(),files:{}};
      if(!channel.files[key]&&Object.keys(channel.files).length>=36)throw Error('limit');
      var folder=DriveApp.getFolderById(props.getProperty('ARTVAC_FOLDER_ID')),file=channel.files[key]?DriveApp.getFileById(channel.files[key].fileId):folder.createFile('artvac-'+key+'.json','',MimeType.PLAIN_TEXT);
      file.setContent(JSON.stringify(report));
      channel.files[key]={fileId:file.getId(),start:report.start,end:report.end,publishedAt:report.publishedAt};
      props.setProperty(channelKey,JSON.stringify(channel));props.setProperty('reader_'+artvacHash_(channel.token),channelKey);
      return artvacJson_({ok:true,token:channel.token,publishedAt:report.publishedAt});
    }
    if(!channel)return artvacJson_({ok:false,error:'not_found'});
    if(body.action==='withdraw'){
      var period=artvacDate_(body.start)+'_'+artvacDate_(body.end);delete channel.files[period];props.setProperty(channelKey,JSON.stringify(channel));return artvacJson_({ok:true});
    }
    if(body.action==='rotate'){
      props.deleteProperty('reader_'+artvacHash_(channel.token));channel.token=newArtvacToken_();props.setProperty(channelKey,JSON.stringify(channel));props.setProperty('reader_'+artvacHash_(channel.token),channelKey);return artvacJson_({ok:true,token:channel.token});
    }
    throw Error('invalid');
  }catch(_){return artvacJson_({ok:false,error:'operation_not_confirmed'});}
  finally{if(lock.hasLock())lock.releaseLock();}
}
