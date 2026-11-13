package com.sealoffice.mobile;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.HashSet;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** 安卓安装包更新：仅安装当前服务确认且签名、摘要一致的应用私有文件。 */
final class NativeUpdater {
    static final int INSTALL_REQUEST = 20942;
    interface Callback { void finish(JSONObject result); }
    interface Listener { void state(JSONObject state); }
    private final Activity activity;
    private final File directory, part;
    private final SharedPreferences preferences;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelled = new AtomicBoolean();
    private final Listener listener;
    private volatile HttpURLConnection connection;
    private volatile boolean active;
    private volatile boolean installing;
    private volatile String taskId = "";
    private JSONObject state;

    NativeUpdater(Activity activity, Listener listener) {
        this.activity = activity; this.listener = listener;
        directory = new File(activity.getFilesDir(), "updates"); part = new File(directory, "pending-part.apk");
        preferences = activity.getSharedPreferences("seal_update", Context.MODE_PRIVATE);
        state = state("空闲", 0, 0, "", "");
    }
    private static JSONObject state(String phase, long done, long total, String version, String error) {
        JSONObject value = new JSONObject();
        try { value.put("阶段", phase); value.put("已下载", done); value.put("总大小", total); if (!version.isEmpty()) value.put("版本", version); if (!error.isEmpty()) value.put("错误", error); }
        catch (Exception ignored) { }
        return value;
    }
    private static JSONObject result(boolean success, JSONObject data, String error) {
        JSONObject result = new JSONObject();
        try { result.put("成功", success); if (data != null) result.put("数据", data); if (!error.isEmpty()) result.put("错误", error); }
        catch (Exception ignored) { }
        return result;
    }
    private synchronized void emit(String phase, long done, long total, String version, String error) {
        state = state(phase, done, total, version, error);
        try { if (!taskId.isEmpty()) state.put("任务标识", taskId); } catch (Exception ignored) { }
        listener.state(state);
    }
    private JSONObject current() { synchronized (this) { try { return new JSONObject(state.toString()); } catch (Exception error) { return state("失败", 0, 0, "", "读取更新状态失败"); } } }
    private static String message(Exception error) { String value = error.getMessage(); return value == null || value.isEmpty() ? "更新操作失败，请重试" : value; }

    private HttpURLConnection open(String address) throws IOException {
        HttpURLConnection request = (HttpURLConnection) new URL(address).openConnection();
        request.setInstanceFollowRedirects(false); request.setConnectTimeout(15000); request.setReadTimeout(60000); request.setRequestProperty("Accept", "application/json, application/octet-stream");
        connection = request;
        if (request.getResponseCode() != 200) { request.disconnect(); throw new IOException("更新服务或安装包下载失败，请稍后重试"); }
        return request;
    }
    private static String urlValue(JSONObject data, String key) { return data.optString(key, ""); }
    private File pendingFile(JSONObject data) { return new File(directory, UpdatePolicy.taskFileName(data.optString("taskId"))); }
    private boolean handed(JSONObject data) { return preferences.getStringSet("handed",Collections.emptySet()).contains(data.optString("taskId")); }
    private void markHanded(JSONObject data) throws IOException {
        Set<String> ids=new HashSet<>(preferences.getStringSet("handed",Collections.emptySet()));ids.add(data.optString("taskId"));
        if(!preferences.edit().putStringSet("handed",ids).commit())throw new IOException("无法保存安装状态，未启动系统安装程序");
    }
    private void discard(JSONObject data, boolean installed) throws IOException {
        if(!UpdatePolicy.canDiscard(handed(data),installed))return;
        File file=pendingFile(data);if(file.exists()&&!file.delete())throw new IOException("无法清理更新安装包");
        if(installed&&handed(data)) {Set<String> ids=new HashSet<>(preferences.getStringSet("handed",Collections.emptySet()));ids.remove(data.optString("taskId"));if(!preferences.edit().putStringSet("handed",ids).commit())throw new IOException("无法清理已安装的更新状态");}
    }
    private void verifyRelease(JSONObject release) throws Exception {
        String base=urlValue(release,"base"), url=urlValue(release,"url"), version=urlValue(release,"version"), sha=urlValue(release,"sha256"), channel=release.optString("channel","stable");
        long bytes=release.optLong("bytes",0);
        if (!UpdatePolicy.validRelease(base,url,version,sha,bytes,channel)) throw new IOException("发布信息或安装包地址无效，已拒绝更新");
        String current=BuildConfig.VERSION_NAME.replace("-本机测试", "");
        String endpoint=base.replaceAll("/+$","")+"/v1/updates/latest?platform=android&version="+URLEncoder.encode(current,"UTF-8")+"&channel="+URLEncoder.encode(channel,"UTF-8");
        HttpURLConnection request=open(endpoint);
        try (InputStream input=request.getInputStream(); ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[8192]; int count, total=0;
            while ((count=input.read(buffer))!=-1) { total+=count; if(total>1024*1024)throw new IOException("更新服务响应过大"); output.write(buffer,0,count); }
            JSONObject latest=new JSONObject(output.toString("UTF-8"));
            if (!UpdatePolicy.matches(latest.optBoolean("hasUpdate",false),latest.optString("version"),latest.optString("url"),latest.optString("sha256"),latest.optLong("bytes",0),version,url,sha,bytes)) throw new IOException("更新已变更或下架，请重新检查版本");
        } finally { request.disconnect(); connection=null; }
    }
    private void verifyPackage(File file, JSONObject release) throws Exception {
        if (!file.isFile() || file.length()!=release.optLong("bytes")) throw new IOException("已下载安装包大小不正确，请重新下载");
        MessageDigest digest=MessageDigest.getInstance("SHA-256"); byte[] buffer=new byte[65536]; int count;
        try(InputStream in=new FileInputStream(file)){while((count=in.read(buffer))!=-1)digest.update(buffer,0,count);}
        StringBuilder sha=new StringBuilder();for(byte b:digest.digest())sha.append(String.format(Locale.ROOT,"%02x",b&255));
        if(!sha.toString().equalsIgnoreCase(release.optString("sha256")))throw new IOException("已下载安装包校验失败，请重新下载");
        PackageManager pm=activity.getPackageManager();int flags=PackageManager.GET_SIGNING_CERTIFICATES;
        PackageInfo archive=pm.getPackageArchiveInfo(file.getAbsolutePath(),flags), installed=pm.getPackageInfo(activity.getPackageName(),flags);
        if(archive==null||!activity.getPackageName().equals(archive.packageName)||!release.optString("version").equals(archive.versionName)||archive.signingInfo==null||installed.signingInfo==null)throw new IOException("安装包身份或版本不匹配，已拒绝安装");
        Signature[] a=archive.signingInfo.getApkContentsSigners(), b=installed.signingInfo.getApkContentsSigners();
        if(a.length!=b.length)throw new IOException("安装包签名不匹配，已拒绝安装");
        String[] left=new String[a.length],right=new String[b.length];for(int i=0;i<a.length;i++)left[i]=a[i].toCharsString();for(int i=0;i<b.length;i++)right[i]=b[i].toCharsString();Arrays.sort(left);Arrays.sort(right);
        if(!Arrays.equals(left,right))throw new IOException("安装包签名不匹配，已拒绝安装");
    }
    private JSONObject saved() throws Exception {
        String raw=preferences.getString("pending", "");if(raw==null||raw.isEmpty())return null;
        JSONObject data=new JSONObject(raw);
        if(!UpdatePolicy.validTaskId(data.optString("taskId")))throw new IOException("待安装更新任务无效，请重新检查更新");
        taskId=data.optString("taskId");
        File pending=pendingFile(data);
        if(!UpdatePolicy.validRelease(data.optString("base"),data.optString("url"),data.optString("version"),data.optString("sha256"),data.optLong("bytes",0),data.optString("channel","stable")))throw new IOException("待安装更新记录无效，请重新检查更新");
        verifyPackage(pending,data);
        PackageManager manager=activity.getPackageManager();
        PackageInfo current=manager.getPackageInfo(activity.getPackageName(),0), archive=manager.getPackageArchiveInfo(pending.getAbsolutePath(),0);
        if(archive==null)throw new IOException("待安装文件无法读取，请重新下载");
        String installedHash="";
        if(current.getLongVersionCode()==archive.getLongVersionCode()) {
            MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[65536];int count;
            try(InputStream in=new FileInputStream(activity.getApplicationInfo().sourceDir)){while((count=in.read(buffer))!=-1)digest.update(buffer,0,count);}
            StringBuilder value=new StringBuilder();for(byte b:digest.digest())value.append(String.format(Locale.ROOT,"%02x",b&255));installedHash=value.toString();
        }
        if(UpdatePolicy.alreadyInstalled(current.getLongVersionCode(),archive.getLongVersionCode(),installedHash,data.optString("sha256"))){
            if(!preferences.edit().remove("pending").commit())throw new IOException("无法清理已完成更新状态");
            discard(data,true);
            taskId="";
            return null;
        }
        return data;
    }
    synchronized void download(JSONObject release, Callback callback) {
        if(active||installing){callback.finish(result(false,null,"已有更新正在下载或安装"));return;}
        active=true;cancelled.set(false);
        executor.execute(()->{
            String version=release.optString("version"),url=release.optString("url");long total=release.optLong("bytes",0);
            try {
                if(installing)throw new IOException("系统安装程序正在运行，请先完成或取消安装");
                taskId=UpdatePolicy.newTaskId();release.put("taskId",taskId);
                String previous=preferences.getString("pending","");
                JSONObject old=previous==null||previous.isEmpty()?null:new JSONObject(previous);
                if(old!=null) {
                    if(!preferences.edit().remove("pending").commit())throw new IOException("无法清除之前的待安装状态");
                    discard(old,false);
                }
                if(!directory.exists()&&!directory.mkdirs())throw new IOException("无法创建更新目录");
                emit("下载中",0,total,version,"");verifyRelease(release);if(cancelled.get())throw new IOException("更新下载已取消");
                HttpURLConnection request=open(url);
                try { UpdateTransfer.write(request.getInputStream(),part,total,release.optString("sha256"),cancelled,done->emit("下载中",done,total,version,"")); }
                finally { request.disconnect();connection=null; }
                if(cancelled.get())throw new IOException("更新下载已取消");
                emit("校验中",total,total,version,"");verifyPackage(part,release);
                if(cancelled.get())throw new IOException("更新下载已取消");
                File destination=pendingFile(release);
                if(!part.renameTo(destination))throw new IOException("无法保存已校验安装包");
                if(!preferences.edit().putString("pending",release.toString()).commit()){
                    if(destination.exists()&&!destination.delete())throw new IOException("无法保存更新状态且无法清理临时安装包");
                    throw new IOException("无法保存待安装更新状态");
                }
                emit("已就绪",total,total,version,"");callback.finish(result(true,current(),""));
            } catch(Exception error) {
                if(part.exists()&&!part.delete())part.deleteOnExit();
                String phase=cancelled.get()?"已取消":"失败";emit(phase,0,total,version,message(error));callback.finish(result(false,current(),message(error)));
            } finally {active=false;connection=null;}
        });
    }
    void cancel(Callback callback) {
        if(installing){callback.finish(result(false,current(),"系统安装程序正在运行，请先完成或取消安装"));return;}
        cancelled.set(true);HttpURLConnection current=connection;if(current!=null)current.disconnect();
        executor.execute(()->{try {if(installing)throw new IOException("系统安装程序正在运行，请先完成或取消安装");String raw=preferences.getString("pending","");JSONObject old=raw==null||raw.isEmpty()?null:new JSONObject(raw);if(!preferences.edit().remove("pending").commit())throw new IOException("无法清除待安装状态");if(old!=null)discard(old,false);emit("已取消",0,0,"","");callback.finish(result(true,current(),"")); }catch(Exception error){callback.finish(result(false,current(),message(error)));}});
    }
    void status(Callback callback) {
        if(active||installing){callback.finish(result(true,current(),""));return;}
        executor.execute(()->{try {if(installing){callback.finish(result(true,current(),""));return;}if(part.exists()&&!part.delete())throw new IOException("无法清理未完成的下载文件");JSONObject data=saved();if(data!=null)emit("已就绪",data.optLong("bytes"),data.optLong("bytes"),data.optString("version"),"");else {taskId="";emit("空闲",0,0,"","");}callback.finish(result(true,current(),""));}catch(Exception error){emit("失败",0,0,"",message(error));callback.finish(result(false,current(),message(error)));}});
    }
    synchronized void install(Callback callback) {
        if(active||installing){callback.finish(result(false,null,"安装包正在下载或安装，请稍后再试"));return;}
        installing=true;
        executor.execute(()->{try {
            JSONObject data=saved();if(data==null)throw new IOException("没有可安装的更新，请重新检查");File pending=pendingFile(data);verifyRelease(data);verifyPackage(pending,data);
            activity.runOnUiThread(()->{try {
                if(Build.VERSION.SDK_INT>=26&&!activity.getPackageManager().canRequestPackageInstalls()){
                    installing=false;
                    activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));
                    callback.finish(result(false,current(),"请允许海豹办公安装未知应用，返回后再次点击更新"));return;
                }
                Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".updates",pending);
                Intent intent=new Intent(Intent.ACTION_INSTALL_PACKAGE).setData(uri).putExtra(Intent.EXTRA_RETURN_RESULT,true).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                markHanded(data);
                activity.startActivityForResult(intent,INSTALL_REQUEST);emit("安装中",data.optLong("bytes"),data.optLong("bytes"),data.optString("version"),"");callback.finish(result(true,current(),""));
            }catch(Exception error){installing=false;callback.finish(result(false,current(),error instanceof IOException?message(error):"无法打开系统安装程序，请检查系统设置"));}});
        }catch(Exception error){installing=false;callback.finish(result(false,current(),message(error)));}});
    }
    void installReturned(){installing=false;status(value -> {});}
    void close(){cancelled.set(true);HttpURLConnection current=connection;if(current!=null)current.disconnect();executor.shutdownNow();}
}
