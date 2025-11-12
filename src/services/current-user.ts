class CurrentUser {
    private userInfo: any = null;
    hydrate(data: any) {
        this.userInfo = data;
    }
    getCurrentUser() {
        return this.userInfo;
    }
}

let currentUser = new CurrentUser();

export default currentUser;