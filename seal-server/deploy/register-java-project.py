import sys, os
os.chdir('/www/server/panel')
sys.path.insert(0, '/www/server/panel')
sys.path.insert(0, '/www/server/panel/class')
import public
from mod.project.java import projectMod
args = public.dict_obj()
args.project_type = 0
args.project_name = 'seal-cloud'
args.project_jar = '/www/server/java_project/seal-server/seal-server.jar'
args.project_jdk = '/www/server/java/jdk-17.0.8'
args.run_user = 'seal-cloud'
args.project_cmd = '/www/server/java/jdk-17.0.8/bin/java -Xms512m -Xmx2g -jar /www/server/java_project/seal-server/seal-server.jar'
args.project_ps = '海豹办公云服务（Spring Boot 重构版）'
args.env_file = '/etc/seal-cloud/service.env'
args.env_list = ['SEAL_SERVER_PORT=8097']
args.domains = []
args.proxy_path = '/'
args.jmx_status = False
args.watch_file = False
args.by_process = 13357
args.daemon_status = True
args.port = '8097'
result = projectMod.main().create_project(args)
print(result)
